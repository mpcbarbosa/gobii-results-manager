import { NextRequest, NextResponse } from "next/server";
/**
 * Authenticate webhook request
 * Accepts token from: Authorization Bearer, X-Gobii-Token header, or query string
 * Priority: GOBII_WEBHOOK_TOKEN > APP_INGEST_TOKEN
 */
function authenticateWebhook(request: NextRequest): boolean {
  const webhookToken = process.env.GOBII_WEBHOOK_TOKEN;
  const ingestToken = process.env.APP_INGEST_TOKEN;
  
  if (!webhookToken && !ingestToken) {
    console.error('[Webhook] No GOBII_WEBHOOK_TOKEN or APP_INGEST_TOKEN configured');
    return false;
  }
  
  // Try Authorization Bearer header (priority 1)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    // Check webhook token first, then ingest token
    if (webhookToken && token === webhookToken) return true;
    if (ingestToken && token === ingestToken) return true;
  }
  
  // Try X-Gobii-Token header (priority 2)
  const gobiiHeader = request.headers.get('x-gobii-token');
  if (gobiiHeader) {
    const token = gobiiHeader.trim();
    if (webhookToken && token === webhookToken) return true;
    if (ingestToken && token === ingestToken) return true;
  }
  
  // Try query string (priority 3)
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token');
  if (queryToken) {
    const token = queryToken.trim();
    if (webhookToken && token === webhookToken) return true;
    if (ingestToken && token === ingestToken) return true;
  }
  
  return false;
}

/**
 * Normalize Gobii webhook payload to ingest format
 */
function normalizeGobiiPayload(body: Record<string, unknown>): { source: { key: string }; leads: unknown[] } | null {
  // Determine source key
  let sourceKey: string | undefined;
  
  // Priority 1: body.source.key
  if (body.source && typeof body.source === 'object') {
    const source = body.source as Record<string, unknown>;
    if (typeof source.key === 'string') {
      sourceKey = source.key;
    }
  }
  
  // Priority 2: body.payload.source.key
  if (!sourceKey && body.payload && typeof body.payload === 'object') {
    const payload = body.payload as Record<string, unknown>;
    if (payload.source && typeof payload.source === 'object') {
      const source = payload.source as Record<string, unknown>;
      if (typeof source.key === 'string') {
        sourceKey = source.key;
      }
    }
  }
  
  // Priority 3: body.agent_name
  if (!sourceKey && typeof body.agent_name === 'string') {
    sourceKey = body.agent_name;
  }
  
  // Priority 4: body.agent_id
  if (!sourceKey && typeof body.agent_id === 'string') {
    sourceKey = body.agent_id;
  }
  
  // Determine leads array first (needed for priority 5)
  let leads: unknown[] | undefined;
  
  // Try body.leads
  if (Array.isArray(body.leads)) {
    leads = body.leads;
  }
  
  // Try body.payload.leads
  if (!leads && body.payload && typeof body.payload === 'object') {
    const payload = body.payload as Record<string, unknown>;
    if (Array.isArray(payload.leads)) {
      leads = payload.leads;
    }
    
    // Try body.payload.lead (single lead)
    if (!leads && payload.lead && typeof payload.lead === 'object') {
      leads = [payload.lead];
    }
    
    // Try body.payload itself if it looks like a lead
    if (!leads && (payload.company || payload.summary)) {
      leads = [payload];
    }
  }
  
  if (!leads || leads.length === 0) {
    return null;
  }
  
  // Priority 5: Check first lead's source.key
  if (!sourceKey || sourceKey === 'gobii-webhook') {
    if (leads.length > 0 && typeof leads[0] === 'object' && leads[0] !== null) {
      const firstLead = leads[0] as Record<string, unknown>;
      if (firstLead.source && typeof firstLead.source === 'object') {
        const leadSource = firstLead.source as Record<string, unknown>;
        if (typeof leadSource.key === 'string') {
          // Check if all leads have the same source
          const allSameSource = leads.every(lead => {
            if (typeof lead === 'object' && lead !== null) {
              const l = lead as Record<string, unknown>;
              if (l.source && typeof l.source === 'object') {
                const s = l.source as Record<string, unknown>;
                return s.key === leadSource.key;
              }
            }
            return false;
          });
          
          sourceKey = allSameSource ? leadSource.key : 'gobii-webhook-mixed';
        }
      }
    }
  }
  
  // Final fallback
  if (!sourceKey) {
    sourceKey = 'gobii-webhook';
  }
  
  // Attach raw data to each lead
  const leadsWithRaw = leads.map((lead, index) => {
    if (typeof lead === 'object' && lead !== null) {
      const leadObj = lead as Record<string, unknown>;
      return {
        ...leadObj,
        raw: {
          gobii: body,
          lead: lead,
          index,
        },
      };
    }
    return lead;
  });
  
  return {
    source: { key: sourceKey },
    leads: leadsWithRaw,
  };
}

/**
 * Handle multi-agent payload format
 */
async function handleMultiAgentPayload(
  request: NextRequest,
  agents: unknown[],
  startTime: number
): Promise<NextResponse> {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  
  if (!host) {
    console.error("[Webhook] Missing host header");
    return NextResponse.json(
      { success: false, error: "Internal configuration error" },
      { status: 500 }
    );
  }
  
  const baseUrl = `${proto}://${host}`;
  const ingestToken = process.env.APP_INGEST_TOKEN;
  
  if (!ingestToken) {
    console.error('[Webhook] APP_INGEST_TOKEN not configured');
    return NextResponse.json(
      { success: false, error: 'Internal configuration error' },
      { status: 500 }
    );
  }
  
  const results = {
    totalCreated: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    byAgent: [] as Array<{
      agentName: string;
      created: number;
      updated: number;
      skipped: number;
    }>,
  };
  
  for (const agent of agents) {
    if (typeof agent !== 'object' || agent === null) continue;
    
    const agentObj = agent as Record<string, unknown>;
    const agentName = typeof agentObj.agent_name === 'string' ? agentObj.agent_name : 'unknown';
    
    try {
      // Normalize agent payload
      const normalized = normalizeGobiiPayload(agentObj);
      
      if (!normalized) {
        console.warn(`[Webhook] No leads in agent ${agentName}`);
        continue;
      }
      
      // Forward to ingest
      const ingestResponse = await fetch(`${baseUrl}/api/ingest/leads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ingestToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalized),
      });
      
      const ingestResult = await ingestResponse.json();
      
      if (ingestResponse.ok && ingestResult.counts) {
        results.totalCreated += ingestResult.counts.created || 0;
        results.totalUpdated += ingestResult.counts.updated || 0;
        results.totalSkipped += ingestResult.counts.skipped || 0;
        
        results.byAgent.push({
          agentName,
          created: ingestResult.counts.created || 0,
          updated: ingestResult.counts.updated || 0,
          skipped: ingestResult.counts.skipped || 0,
        });
      }
    } catch (error) {
      console.error(`[Webhook] Error processing agent ${agentName}:`, error);
    }
  }
  
  const duration = Date.now() - startTime;
  
  console.log('[Webhook] Multi-agent success:', {
    agentCount: agents.length,
    totalCreated: results.totalCreated,
    totalUpdated: results.totalUpdated,
    totalSkipped: results.totalSkipped,
    duration: `${duration}ms`,
  });
  
  return NextResponse.json({
    success: true,
    multiAgent: true,
    agentCount: agents.length,
    totalCreated: results.totalCreated,
    totalUpdated: results.totalUpdated,
    totalSkipped: results.totalSkipped,
    byAgent: results.byAgent,
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authenticate
    if (!authenticateWebhook(request)) {
      console.warn('[Webhook] Unauthorized webhook attempt');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse body
    const body = await request.json();
    
    // Log webhook received (without sensitive data)
    const agentFields: Record<string, unknown> = {};
    const agentKeys = ['agent_name', 'agent_id', 'agent', 'workflow', 'scanner', 'source_type'];
    agentKeys.forEach(key => {
      if (body[key] !== undefined) {
        agentFields[key] = body[key];
      }
    });
    
    console.log('[Webhook] Received:', {
      timestamp: new Date().toISOString(),
      bodyKeys: Object.keys(body),
      agentFields,
      hasPayload: !!body.payload,
      hasLeads: !!body.leads,
      hasAgents: !!body.agents,
    });
    
    // Check for multi-agent format
    if (body.agents && Array.isArray(body.agents)) {
      return await handleMultiAgentPayload(request, body.agents, startTime);
    }
    
    // Normalize single payload
    const normalized = normalizeGobiiPayload(body);
    
    if (!normalized) {
      // Return success with zero counts (healthcheck/empty cycle)
      console.log('[Webhook] No leads found in payload (empty cycle)');
      return NextResponse.json({
        success: true,
        sourceKey: 'unknown',
        counts: { created: 0, updated: 0, skipped: 0 },
        domainAutofill: { applied: 0, skipped: 0 },
      });
    }
    
    console.log('[Webhook] Normalized:', {
      sourceKey: normalized.source.key,
      leadsCount: normalized.leads.length,
    });
    
    // Forward to ingest endpoint internally
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
if (!host) {
  console.error("[Webhook] Missing host header");
  return Response.json(
    { success: false, error: "Internal configuration error", message: "Missing host header" },
    { status: 500 }
  );
}
const baseUrl = `${proto}://${host}`;
const ingestToken = process.env.APP_INGEST_TOKEN;
    if (!ingestToken) {
      console.error('[Webhook] APP_INGEST_TOKEN not configured');
      return NextResponse.json(
        { success: false, error: 'Internal configuration error' },
        { status: 500 }
      );
    }
    
    const ingestResponse = await fetch(`${baseUrl}/api/ingest/leads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ingestToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalized),
    });
    
    const ingestResult = await ingestResponse.json();
    
    if (!ingestResponse.ok) {
      console.error('[Webhook] Ingest failed:', {
        status: ingestResponse.status,
        error: ingestResult.error,
      });
      return NextResponse.json(
        { success: false, error: ingestResult.error || 'Ingest failed' },
        { status: ingestResponse.status }
      );
    }
    
    const duration = Date.now() - startTime;
    
    console.log('[Webhook] Success:', {
      sourceKey: normalized.source.key,
      counts: ingestResult.counts,
      duration: `${duration}ms`,
    });
    
    return NextResponse.json({
      success: true,
      sourceKey: normalized.source.key,
      counts: ingestResult.counts,
      domainAutofill: ingestResult.domainAutofill,
    });
    
  } catch (error) {
    console.error('[Webhook] Error:', error instanceof Error ? error.message : 'Unknown error');
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

