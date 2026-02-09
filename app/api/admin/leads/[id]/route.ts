import { NextRequest, NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { LeadStatus } from '@prisma/client';
import { requireAdminAuth } from "@/lib/adminAuth";
import { deriveCommercialSignal, type ActivityInput } from "@/lib/crm/deriveCommercialSignal";
import { deriveLeadTemperature } from "@/lib/crm/deriveLeadTemperature";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate (supports Bearer token and session cookie)
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    console.log('[Admin Leads Detail] Auth failed:', {
      status: auth.status,
      error: auth.error,
      hasCookie: !!request.cookies.get('gobii_admin_session'),
      hasBearer: !!request.headers.get('authorization'),
    });
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }
  
  try {
    const { id } = await params;
    
    // Fetch lead with all related data
    // 30-day window for SYSTEM activities used in signal derivation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            domain: true,
            website: true,
            country: true,
            industry: true,
            size: true,
          },
        },
        activities: {
          where: {
            type: "SYSTEM",
            createdAt: { gte: thirtyDaysAgo },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            title: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });
    
    if (!lead) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      );
    }
    
    // Extract data from JSON fields
    let summary: string | undefined;
    let trigger: string | undefined;
    let _externalId: string | undefined;
    if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
      const enriched = lead.enrichedData as Record<string, unknown>;
      summary = typeof enriched.summary === 'string' ? enriched.summary : undefined;
      trigger = typeof enriched.trigger === 'string' ? enriched.trigger : undefined;
      _externalId = typeof enriched.external_id === 'string' ? enriched.external_id : undefined;
    }
    
    let probability: number | undefined;
    let scoreTrigger: number | undefined;
    let scoreProbability: number | undefined;
    if (lead.scoreDetails && typeof lead.scoreDetails === 'object' && lead.scoreDetails !== null) {
      const details = lead.scoreDetails as Record<string, unknown>;
      probability = (typeof details.probability_value === 'number' ? details.probability_value : undefined) ||
                    (typeof details.probability === 'number' ? details.probability : undefined);
      scoreTrigger = typeof details.trigger === 'number' ? details.trigger : undefined;
      scoreProbability = typeof details.probability === 'number' ? details.probability : undefined;
    }
    
    // Extract contact from rawData if available
    let contact: { name?: string; email?: string; phone?: string; role?: string } | null = null;
    if (lead.rawData && typeof lead.rawData === 'object' && lead.rawData !== null) {
      const raw = lead.rawData as Record<string, unknown>;
      if (raw.contact && typeof raw.contact === 'object') {
        const contactData = raw.contact as Record<string, unknown>;
        contact = {
          name: typeof contactData.name === 'string' ? contactData.name :
                (typeof contactData.full_name === 'string' ? contactData.full_name : undefined),
          email: typeof contactData.email === 'string' ? contactData.email : undefined,
          phone: typeof contactData.phone === 'string' ? contactData.phone : undefined,
          role: typeof contactData.role === 'string' ? contactData.role : undefined,
        };
      }
    }
    
    // Derive commercial signal from SYSTEM activities
    const systemActivities: ActivityInput[] = lead.activities.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      notes: a.notes,
      createdAt: a.createdAt,
    }));
    const signal = deriveCommercialSignal(systemActivities);
    const temperature = deriveLeadTemperature(signal.signalLevel);

    return NextResponse.json({
      success: true,
      item: {
        id: lead.id,
        dedupeKey: lead.dedupeKey,
        status: lead.status,
        score: lead.score,
        summary,
        trigger,
        probability,
        score_trigger: scoreTrigger,
        score_probability: scoreProbability,
        score_final: lead.score,
        notes: lead.notes,
        owner: lead.owner,
        nextActionAt: lead.nextActionAt,
        seenCount: lead.seenCount,
        lastSeenAt: lead.lastSeenAt,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        deletedAt: lead.deletedAt,
        rawData: lead.rawData,
        enrichedData: lead.enrichedData,
        scoreDetails: lead.scoreDetails,
        source: {
          id: lead.source.id,
          name: lead.source.name,
          type: lead.source.type,
        },
        account: {
          id: lead.account.id,
          name: lead.account.name,
          domain: lead.account.domain,
          website: lead.account.website,
          country: lead.account.country,
          industry: lead.account.industry,
          size: lead.account.size,
        },
        contact,
        commercialSignal: {
          signalLevel: signal.signalLevel,
          temperature,
          reasons: signal.reasons,
          lastSignalAt: signal.lastSignalAt,
          lastSignalCategory: signal.lastSignalCategory,
          lastSignalAgent: signal.lastSignalAgent,
          lastSignalSourceUrl: signal.lastSignalSourceUrl,
          lastSignalConfidence: signal.lastSignalConfidence,
        },
      },
    });
    
  } catch (error) {
    console.error('Get lead error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate (supports Bearer token and session cookie)
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }
  
  try {
    const { id } = await params;
    
    // Parse request body
    const body = await request.json();
    
    // Validate status if provided
    if (body.status !== undefined) {
      const validStatuses = Object.values(LeadStatus);
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
    }
    
    // Validate nextActionAt if provided
    let nextActionAt: Date | null | undefined = undefined;
    if (body.nextActionAt !== undefined) {
      if (body.nextActionAt === null) {
        nextActionAt = null;
      } else if (typeof body.nextActionAt === 'string') {
        try {
          nextActionAt = new Date(body.nextActionAt);
          if (isNaN(nextActionAt.getTime())) {
            return NextResponse.json(
              { error: 'Invalid nextActionAt. Must be a valid ISO 8601 date string' },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: 'Invalid nextActionAt. Must be a valid ISO 8601 date string' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Invalid nextActionAt. Must be a string or null' },
          { status: 400 }
        );
      }
    }
    
    // Check if lead exists
    const existingLead = await prisma.lead.findUnique({
      where: { id },
    });
    
    if (!existingLead) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      );
    }
    
    // Build update data
    const updateData: Record<string, unknown> = {};
    
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }
    
    if (body.owner !== undefined) {
      updateData.owner = body.owner;
    }
    
    if (nextActionAt !== undefined) {
      updateData.nextActionAt = nextActionAt;
    }
    
    // Update lead
    const updatedLead = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            domain: true,
            website: true,
            country: true,
            industry: true,
          },
        },
      },
    });
    
    // Extract data from JSON fields
    let summary: string | undefined;
    let trigger: string | undefined;
    if (updatedLead.enrichedData && typeof updatedLead.enrichedData === 'object' && updatedLead.enrichedData !== null) {
      const enriched = updatedLead.enrichedData as Record<string, unknown>;
      summary = typeof enriched.summary === 'string' ? enriched.summary : undefined;
      trigger = typeof enriched.trigger === 'string' ? enriched.trigger : undefined;
    }
    
    let probability: number | undefined;
    if (updatedLead.scoreDetails && typeof updatedLead.scoreDetails === 'object' && updatedLead.scoreDetails !== null) {
      const details = updatedLead.scoreDetails as Record<string, unknown>;
      probability = (typeof details.probability_value === 'number' ? details.probability_value : undefined) || 
                    (typeof details.probability === 'number' ? details.probability : undefined);
    }
    
    // Format response
    return NextResponse.json({
      success: true,
      lead: {
        id: updatedLead.id,
        status: updatedLead.status,
        score: updatedLead.score,
        summary,
        trigger,
        probability,
        notes: updatedLead.notes,
        owner: updatedLead.owner,
        nextActionAt: updatedLead.nextActionAt,
        createdAt: updatedLead.createdAt,
        updatedAt: updatedLead.updatedAt,
        source: {
          id: updatedLead.source.id,
          name: updatedLead.source.name,
          type: updatedLead.source.type,
        },
        account: {
          id: updatedLead.account.id,
          name: updatedLead.account.name,
          domain: updatedLead.account.domain,
          website: updatedLead.account.website,
          country: updatedLead.account.country,
          industry: updatedLead.account.industry,
        },
      },
    });
    
  } catch (error) {
    console.error('Update lead error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
