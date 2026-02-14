import { NextRequest, NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { ingestBatchSchema, type LeadInput } from '@/lib/validators/ingest';
import { generateDedupeKey } from '@/lib/utils/dedupe';
import { normalizeCompanyName, normalizeEmail } from '@/lib/utils/normalize';
import { generateDomainSuggestionFromLeadData, isInvalidDomain } from '@/lib/utils/domain-suggestion';
import { LeadStatus } from '@prisma/client';
import { recordIngestAudit } from '@/lib/crm/auditIngest';

// Authentication middleware
function authenticate(request: NextRequest): { success: boolean; error?: string; status?: number } {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }
  
  const token = authHeader.substring(7).trim(); // Remove 'Bearer ' prefix and trim
  
  // Check if APP_INGEST_TOKEN is configured
  const ingestToken = process.env.APP_INGEST_TOKEN;
  if (!ingestToken) {
    console.error('APP_INGEST_TOKEN not configured');
    return { success: false, error: 'APP_INGEST_TOKEN not configured', status: 500 };
  }
  
  // Accept either APP_INGEST_TOKEN or APP_ADMIN_TOKEN
  const adminToken = process.env.APP_ADMIN_TOKEN;
  
  if (token === ingestToken || (adminToken && token === adminToken)) {
    return { success: true };
  }
  
  return { success: false, error: 'Unauthorized', status: 401 };
}

export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = authenticate(request);
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status || 401 }
    );
  }
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = ingestBatchSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }
    
    const { source: sourceInput, leads: leadsInput } = validationResult.data;
    
    // Upsert Source
    const _source = await prisma.source.upsert({
      where: { name: sourceInput.key },
      update: {},
      create: {
        name: sourceInput.key,
        type: 'scanner', // Default type
        isActive: true,
      },
    });
    // Cache de sources por nome (key) para suportar payloads multi-source no mesmo request
    const sourceCache = new Map<string, { id: string; name: string; type: string }>();
    sourceCache.set(sourceInput.key, _source);

    async function getSourceForKey(key: string) {
      const cached = sourceCache.get(key);
      if (cached) return cached;

      const s = await prisma.source.upsert({
        where: { name: key },
        update: {},
        create: { name: key, type: 'scanner' },
      });

      sourceCache.set(key, s);
      return s;
    }

    
    // Process leads
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      ids: [] as string[],
      domainAutofill: {
        applied: 0,
        skipped: 0,
      },
      debug: [] as Array<{ 
        leadId: string; 
        accountMatchedBy: string;
        domainAutofillAction: string;
        domainAutofillReason: string;
      }>,
    };
    
    for (const leadInput of leadsInput) {
      try {
        // Determine source: lead.source > request.source
        const leadSource = leadInput.source || sourceInput;
        if (!leadSource || !leadSource.key) {
          throw new Error('Source is required (either at request level or lead level)');
        }
        
                const src = await getSourceForKey(leadSource.key);
        const result = await processLead(leadSource.key, src.id, leadInput);
        results.ids.push(result.leadId);
        results.debug.push({ 
          leadId: result.leadId, 
          accountMatchedBy: result.accountMatchedBy,
          domainAutofillAction: result.domainAutofillAction,
          domainAutofillReason: result.domainAutofillReason,
        });
        if (result.isNew) {
          results.created++;
        } else {
          results.updated++;
        }
        if (result.domainAutofilled) {
          results.domainAutofill.applied++;
        } else if (result.domainSkipped) {
          results.domainAutofill.skipped++;
        }
      } catch (error) {
        console.error('Error processing lead:', error);
        results.skipped++;
      }
    }
    
    console.log(`Ingestion completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.domainAutofill.applied} domains autofilled`);
    
    // Record audit
    await recordIngestAudit({
      agent: sourceInput.key ?? "unknown",
      endpoint: "/api/ingest/leads",
      status: results.created + results.updated > 0 ? "SUCCESS" : "SKIPPED",
      processed: leadsInput.length,
      created: results.created,
      updated: results.updated,
      skipped: results.skipped,
      meta: { sourceKey: sourceInput.key, sampleIds: results.ids.slice(0, 3) },
    });

    return NextResponse.json({
      success: true,
      counts: {
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
      },
      domainAutofill: results.domainAutofill,
      debug: results.debug,
      ids: results.ids,
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    
    await recordIngestAudit({
      agent: "unknown",
      endpoint: "/api/ingest/leads",
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function processLead(sourceKey: string, sourceId: string, leadInput: LeadInput): Promise<{ 
  leadId: string; 
  isNew: boolean; 
  domainAutofilled: boolean; 
  domainSkipped: boolean;
  accountMatchedBy: 'domain' | 'suggested_domain' | 'name' | 'created';
  domainAutofillAction: 'applied' | 'skipped' | 'none';
  domainAutofillReason: string;
}> {
  // Normalize company name
  const companyNameNormalized = leadInput.company.name_normalized || 
    normalizeCompanyName(leadInput.company.name);
  
  // Normalize domain if provided
  let normalizedDomain = leadInput.company.domain ? 
    leadInput.company.domain.toLowerCase().trim() : null;
  
  // Track domain autofill
  let domainAutofilled = false;
  let domainSkipped = false;
  
  // Auto-fill domain if missing or invalid
  if (normalizedDomain === null || isInvalidDomain(normalizedDomain)) {
    const suggestion = generateDomainSuggestionFromLeadData(
      leadInput.company.website,
      leadInput.contact?.email,
      leadInput.company.name
    );
    
    // Only apply if confidence is HIGH
    if (suggestion.confidence === 'high' && suggestion.suggestedDomain) {
      normalizedDomain = suggestion.suggestedDomain;
      domainAutofilled = true;
    } else if (suggestion.suggestedDomain) {
      // Medium confidence - skip for admin tool
      domainSkipped = true;
    }
  }
  
  // Generate dedupe key
  const dedupeKey = generateDedupeKey({
    sourceKey,
    companyName: leadInput.company.name,
    country: leadInput.company.country,
    contactEmail: leadInput.contact?.email,
    trigger: leadInput.trigger || 'no-trigger',
  });
  
  // Find or create Account with improved deduplication
  let account = null;
  let accountMatchedBy: 'domain' | 'suggested_domain' | 'name' | 'created' = 'created';
  
  // Priority A: Try to find by valid domain
  if (normalizedDomain && !isInvalidDomain(normalizedDomain)) {
    account = await prisma.account.findUnique({
      where: { domain: normalizedDomain },
    });
    if (account) {
      accountMatchedBy = 'domain';
    }
  }
  
  // Priority B: Try to find by suggested domain (if HIGH confidence)
  if (!account && domainAutofilled && normalizedDomain) {
    account = await prisma.account.findUnique({
      where: { domain: normalizedDomain },
    });
    if (account) {
      accountMatchedBy = 'suggested_domain';
    }
  }
  
  // Priority C: Try to find by normalized name
  if (!account) {
    account = await prisma.account.findFirst({
      where: {
        nameNormalized: companyNameNormalized,
        deletedAt: null,
      },
    });
    if (account) {
      accountMatchedBy = 'name';
    }
  }
  
  // Determine if we should update domain
  let shouldUpdateDomain = false;
  let domainUpdateReason = '';
  
  if (account) {
    // Check if domain is locked
    if (account.domainLocked) {
      domainUpdateReason = 'locked';
      domainSkipped = true;
    } else if (account.domain === null || isInvalidDomain(account.domain)) {
      // Only update if current is null or invalid
      if (normalizedDomain) {
        shouldUpdateDomain = true;
        domainUpdateReason = 'autofilled';
        domainAutofilled = true;
      }
    }
  }
  
  // Create or update account
  if (account) {
    // Update existing account
    account = await prisma.account.update({
      where: { id: account.id },
      data: {
        name: leadInput.company.name,
        nameNormalized: companyNameNormalized,
        // Only update domain if not locked and (null or invalid)
        domain: shouldUpdateDomain ? normalizedDomain : account.domain,
        website: leadInput.company.website || account.website,
        industry: leadInput.company.industry || account.industry,
        size: leadInput.company.size || account.size,
        country: leadInput.company.country || account.country,
      },
    });
  } else {
    // Create new account
    account = await prisma.account.create({
      data: {
        name: leadInput.company.name,
        nameNormalized: companyNameNormalized,
        domain: normalizedDomain,
        domainLocked: false,
        website: leadInput.company.website,
        industry: leadInput.company.industry,
        size: leadInput.company.size,
        country: leadInput.company.country,
      },
    });
    accountMatchedBy = 'created';
    if (normalizedDomain) {
      domainAutofilled = true;
      domainUpdateReason = 'autofilled';
    }
  }
  
  // Upsert Contact if email provided
  let _contactId: string | undefined; // Reserved for future use
  if (leadInput.contact?.email) {
    const normalizedEmail = normalizeEmail(leadInput.contact.email);
    
    // Determine fullName from name or full_name
    const fullName = leadInput.contact.name || leadInput.contact.full_name || '';
    
    // Find existing contact by email
    let contact = await prisma.contact.findFirst({
      where: { 
        email: normalizedEmail,
        accountId: account.id,
      },
    });
    
    if (contact) {
      // Update existing contact
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          fullName: fullName || contact.fullName,
          phone: leadInput.contact.phone || contact.phone,
          title: leadInput.contact.role || contact.title,
        },
      });
    } else {
      // Check if this is the first contact for this account
      const existingContactsCount = await prisma.contact.count({
        where: {
          accountId: account.id,
          deletedAt: null,
        },
      });
      
      // Check if there's already a primary contact
      const hasPrimaryContact = await prisma.contact.findFirst({
        where: {
          accountId: account.id,
          isPrimary: true,
          deletedAt: null,
        },
      });
      
      // Set isPrimary=true if this is the first contact or no primary exists
      const isPrimary = existingContactsCount === 0 || !hasPrimaryContact;
      
      // Create new contact
      contact = await prisma.contact.create({
        data: {
          accountId: account.id,
          email: normalizedEmail,
          firstName: fullName.split(' ')[0] || '',
          lastName: fullName.split(' ').slice(1).join(' ') || '',
          fullName: fullName,
          phone: leadInput.contact.phone,
          title: leadInput.contact.role,
          isPrimary,
        },
      });
    }
    
    _contactId = contact.id;
  }
  
  // Check if lead exists
  const existingLead = await prisma.lead.findUnique({
    where: { dedupeKey },
  });
  
  const isNew = !existingLead;
  
  // Build score details if scores provided
  const scoreDetails = (leadInput.score_trigger !== undefined || 
                        leadInput.score_probability !== undefined || 
                        leadInput.score_final !== undefined || 
                        leadInput.probability !== undefined) ? {
    trigger: leadInput.score_trigger,
    probability: leadInput.score_probability,
    final: leadInput.score_final,
    probability_value: leadInput.probability,
  } : undefined;
  
  // Build enriched data
  const enrichedData = {
    summary: leadInput.summary,
    trigger: leadInput.trigger,
    external_id: leadInput.external_id,
  };
  
  // Upsert Lead
  const now = new Date();
  const lead = await prisma.lead.upsert({
    where: { dedupeKey },
    update: {
      // Update scores if provided
      score: leadInput.score_final !== undefined ? leadInput.score_final : undefined,
      scoreDetails: scoreDetails || undefined,
      rawData: leadInput.raw || undefined,
      enrichedData,
      // Increment seen count and update last seen
      seenCount: existingLead ? existingLead.seenCount + 1 : 1,
      lastSeenAt: now,
    },
    create: {
      dedupeKey,
      sourceId,
      accountId: account.id,
      title: leadInput.contact?.role,
      score: leadInput.score_final,
      scoreDetails: scoreDetails || undefined,
      status: LeadStatus.NEW,
      priority: leadInput.score_final ? Math.round(leadInput.score_final / 10) : 0,
      rawData: leadInput.raw,
      enrichedData,
      seenCount: 1,
      lastSeenAt: now,
    },
  });
  
  // Create ScoringRun (only if scores provided, for historical tracking)
  if (leadInput.score_final !== undefined) {
    await prisma.scoringRun.create({
      data: {
        sourceId,
        leadId: lead.id,
        score: leadInput.score_final,
        scoreData: {
          trigger: leadInput.score_trigger,
          probability: leadInput.score_probability,
          final: leadInput.score_final,
          probability_value: leadInput.probability,
          summary: leadInput.summary,
          raw: leadInput.raw,
        },
        version: 'v1.0',
      },
    });
  }
  
  // Create LeadStatusHistory if new lead
  if (isNew) {
    // Get a system user or create one
    let systemUser = await prisma.user.findFirst({
      where: { email: 'system@gobii.com' },
    });
    
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: {
          email: 'system@gobii.com',
          name: 'System',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }
    
    await prisma.leadStatusHistory.create({
      data: {
        leadId: lead.id,
        fromStatus: null,
        toStatus: LeadStatus.NEW,
        reason: 'Lead created via ingestion API',
        changedById: systemUser.id,
      },
    });
  }
  
  const domainAutofillAction = domainAutofilled ? 'applied' : (domainSkipped ? 'skipped' : 'none');
  
  return { 
    leadId: lead.id, 
    isNew, 
    domainAutofilled, 
    domainSkipped, 
    accountMatchedBy,
    domainAutofillAction,
    domainAutofillReason: domainUpdateReason || 'none',
  };
}
