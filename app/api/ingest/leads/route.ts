import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestBatchSchema, type LeadInput } from '@/lib/validators/ingest';
import { generateDedupeKey } from '@/lib/utils/dedupe';
import { normalizeCompanyName, normalizeEmail } from '@/lib/utils/normalize';
import { generateDomainSuggestionFromLeadData, isInvalidDomain } from '@/lib/utils/domain-suggestion';
import { LeadStatus } from '@prisma/client';

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
    const source = await prisma.source.upsert({
      where: { name: sourceInput.key },
      update: {},
      create: {
        name: sourceInput.key,
        type: 'scanner', // Default type
        isActive: true,
      },
    });
    
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
    };
    
    for (const leadInput of leadsInput) {
      try {
        const result = await processLead(source.id, leadInput);
        results.ids.push(result.leadId);
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
    
    return NextResponse.json({
      success: true,
      counts: {
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
      },
      domainAutofill: results.domainAutofill,
      ids: results.ids,
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function processLead(sourceId: string, leadInput: LeadInput): Promise<{ leadId: string; isNew: boolean; domainAutofilled: boolean; domainSkipped: boolean }> {
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
    sourceKey: sourceId,
    companyName: leadInput.company.name,
    country: leadInput.company.country,
    contactEmail: leadInput.contact?.email,
    trigger: leadInput.trigger,
  });
  
  // Upsert Account - use domain or fallback to name_normalized for unique constraint
  const accountLookupKey = normalizedDomain || `fallback-${companyNameNormalized}-${leadInput.company.country || 'unknown'}`;
  
  const account = await prisma.account.upsert({
    where: {
      domain: accountLookupKey,
    },
    update: {
      name: leadInput.company.name,
      nameNormalized: companyNameNormalized,
      // Only update domain if it's null or invalid (never overwrite valid domains)
      domain: normalizedDomain,
      website: leadInput.company.website,
      industry: leadInput.company.industry,
      size: leadInput.company.size,
      country: leadInput.company.country,
    },
    create: {
      name: leadInput.company.name,
      nameNormalized: companyNameNormalized,
      domain: normalizedDomain,
      website: leadInput.company.website,
      industry: leadInput.company.industry,
      size: leadInput.company.size,
      country: leadInput.company.country,
    },
  });
  
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
  
  // Upsert Lead
  const lead = await prisma.lead.upsert({
    where: { dedupeKey },
    update: {
      score: leadInput.score_final,
      scoreDetails: {
        trigger: leadInput.score_trigger,
        probability: leadInput.score_probability,
        final: leadInput.score_final,
        probability_value: leadInput.probability,
      },
      rawData: leadInput.raw,
      enrichedData: {
        summary: leadInput.summary,
        trigger: leadInput.trigger,
        external_id: leadInput.external_id,
      },
    },
    create: {
      dedupeKey,
      sourceId,
      accountId: account.id,
      title: leadInput.contact?.role,
      score: leadInput.score_final,
      scoreDetails: {
        trigger: leadInput.score_trigger,
        probability: leadInput.score_probability,
        final: leadInput.score_final,
        probability_value: leadInput.probability,
      },
      status: LeadStatus.NEW,
      priority: Math.round(leadInput.score_final / 10), // Convert 0-100 to 0-10
      rawData: leadInput.raw,
      enrichedData: {
        summary: leadInput.summary,
        trigger: leadInput.trigger,
        external_id: leadInput.external_id,
      },
    },
  });
  
  // Create ScoringRun (always, for historical tracking)
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
  
  return { leadId: lead.id, isNew, domainAutofilled, domainSkipped };
}
