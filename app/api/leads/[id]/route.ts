import { NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { requireBearerToken, unauthorizedResponse } from '@/lib/auth/token';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate
  if (!requireBearerToken(request, 'APP_READ_TOKEN')) {
    return unauthorizedResponse();
  }
  
  try {
    const { id } = await params;
    
    // Fetch lead with all related data
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            nameNormalized: true,
            domain: true,
            website: true,
            industry: true,
            size: true,
            location: true,
            country: true,
            description: true,
            linkedinUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        statusHistory: {
          orderBy: {
            changedAt: 'desc',
          },
          include: {
            changedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        scoringRuns: {
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            score: true,
            scoreData: true,
            version: true,
            createdAt: true,
          },
        },
        interactions: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                title: true,
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        assignments: {
          orderBy: {
            assignedAt: 'desc',
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        handoffs: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            acceptedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
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
    
    // Check if soft deleted
    if (lead.deletedAt) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      );
    }
    
    // Get all contacts for the account
    const contacts = await prisma.contact.findMany({
      where: {
        accountId: lead.accountId,
        deletedAt: null,
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        title: true,
        department: true,
        seniority: true,
        linkedinUrl: true,
        isPrimary: true,
        createdAt: true,
      },
    });
    
    // Extract data from JSON fields
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
    
    let trigger: string | undefined;
    let summary: string | undefined;
    let externalId: string | undefined;
    if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
      const enriched = lead.enrichedData as Record<string, unknown>;
      trigger = typeof enriched.trigger === 'string' ? enriched.trigger : undefined;
      summary = typeof enriched.summary === 'string' ? enriched.summary : undefined;
      externalId = typeof enriched.external_id === 'string' ? enriched.external_id : undefined;
    }
    
    // Format response
    const response = {
      lead: {
        id: lead.id,
        dedupeKey: lead.dedupeKey,
        externalId,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        status: lead.status,
        statusReason: lead.statusReason,
        priority: lead.priority,
        tags: lead.tags,
        trigger,
        summary,
        probability,
        scoreTrigger,
        scoreProbability,
        scoreFinal: lead.score,
        title: lead.title,
        seniority: lead.seniority,
        department: lead.department,
        rawData: lead.rawData,
        enrichedData: lead.enrichedData,
        scoreDetails: lead.scoreDetails,
      },
      source: {
        id: lead.source.id,
        name: lead.source.name,
        type: lead.source.type,
        description: lead.source.description,
      },
      account: {
        id: lead.account.id,
        name: lead.account.name,
        nameNormalized: lead.account.nameNormalized,
        domain: lead.account.domain,
        website: lead.account.website,
        industry: lead.account.industry,
        size: lead.account.size,
        location: lead.account.location,
        country: lead.account.country,
        description: lead.account.description,
        linkedinUrl: lead.account.linkedinUrl,
        createdAt: lead.account.createdAt,
        updatedAt: lead.account.updatedAt,
      },
      contacts,
      statusHistory: lead.statusHistory.map(h => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        reason: h.reason,
        notes: h.notes,
        changedAt: h.changedAt,
        changedBy: {
          id: h.changedBy.id,
          name: h.changedBy.name,
          email: h.changedBy.email,
        },
      })),
      scoringRuns: lead.scoringRuns.map(s => ({
        id: s.id,
        score: s.score,
        scoreData: s.scoreData,
        version: s.version,
        createdAt: s.createdAt,
      })),
      interactions: lead.interactions.map(i => ({
        id: i.id,
        channel: i.channel,
        outcome: i.outcome,
        subject: i.subject,
        notes: i.notes,
        duration: i.duration,
        scheduledAt: i.scheduledAt,
        completedAt: i.completedAt,
        createdAt: i.createdAt,
        contact: i.contact ? {
          id: i.contact.id,
          fullName: i.contact.fullName,
          email: i.contact.email,
          phone: i.contact.phone,
          title: i.contact.title,
        } : null,
        user: {
          id: i.user.id,
          name: i.user.name,
          email: i.user.email,
        },
      })),
      assignments: lead.assignments.map(a => ({
        id: a.id,
        assignedAt: a.assignedAt,
        unassignedAt: a.unassignedAt,
        reason: a.reason,
        notes: a.notes,
        user: {
          id: a.user.id,
          name: a.user.name,
          email: a.user.email,
          role: a.user.role,
        },
      })),
      handoffs: lead.handoffs.map(h => ({
        id: h.id,
        toTeam: h.toTeam,
        status: h.status,
        reason: h.reason,
        notes: h.notes,
        priority: h.priority,
        metadata: h.metadata,
        createdAt: h.createdAt,
        acceptedAt: h.acceptedAt,
        rejectedAt: h.rejectedAt,
        completedAt: h.completedAt,
        rejectionReason: h.rejectionReason,
        createdBy: {
          id: h.createdBy.id,
          name: h.createdBy.name,
          email: h.createdBy.email,
        },
        acceptedBy: h.acceptedBy ? {
          id: h.acceptedBy.id,
          name: h.acceptedBy.name,
          email: h.acceptedBy.email,
        } : null,
      })),
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error fetching lead:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
