import { NextRequest, NextResponse } from 'next/server';

/**
 * Authenticate webhook request
 * Accepts token from: Authorization Bearer, query string, or X-Gobii-Token header
 */
function authenticateWebhook(request: NextRequest): boolean {
  const webhookToken = process.env.GOBII_WEBHOOK_TOKEN;
  const ingestToken = process.env.APP_INGEST_TOKEN;
  
  // If no webhook token configured, fall back to ingest token
  const expectedToken = webhookToken || ingestToken;
  
  if (!expectedToken) {
    console.error('[Webhook] No GOBII_WEBHOOK_TOKEN or APP_INGEST_TOKEN configured');
    return false;
  }
  
  // Try Authorization Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === expectedToken) return true;
  }
  
  // Try X-Gobii-Token header
  const gobiiHeader = request.headers.get('x-gobii-token');
  if (gobiiHeader && gobiiHeader.trim() === expectedToken) {
    return true;
  }
  
  // Try query string
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token');
  if (queryToken && queryToken.trim() === expectedToken) {
    return true;
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
  
  // Fallback
  if (!sourceKey) {
    sourceKey = 'gobii-webhook';
  }
  
  // Determine leads array
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
  
  return {
    source: { key: sourceKey },
    leads,
  };
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
    console.log('[Webhook] Received:', {
      timestamp: new Date().toISOString(),
      bodyKeys: Object.keys(body),
      hasPayload: !!body.payload,
      hasLeads: !!body.leads,
    });
    
    // Normalize payload
    const normalized = normalizeGobiiPayload(body);
    
    if (!normalized) {
      console.error('[Webhook] No leads found in payload');
      return NextResponse.json(
        { success: false, error: 'No leads found in payload' },
        { status: 400 }
      );
    }
    
    console.log('[Webhook] Normalized:', {
      sourceKey: normalized.source.key,
      leadsCount: normalized.leads.length,
    });
    
    // Forward to ingest endpoint internally
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    process.env.BASE_URL || 
                    new URL(request.url).origin;
    
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
