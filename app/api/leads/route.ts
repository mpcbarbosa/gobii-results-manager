import { NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { requireBearerToken, unauthorizedResponse } from '@/lib/auth/token';
import {
  leadsQuerySchema,
  buildLeadsWhereClause,
  buildLeadsOrderBy,
} from '@/lib/validators/leads';

export async function GET(request: NextRequest) {
  // Authenticate
  if (!requireBearerToken(request, 'APP_READ_TOKEN')) {
    return unauthorizedResponse();
  }
  
  try {
    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    
    const validationResult = leadsQuerySchema.safeParse(queryParams);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }
    
    const params = validationResult.data;
    
    // Build where clause
    const where = buildLeadsWhereClause(params);
    
    // Build orderBy clause
    const orderBy = buildLeadsOrderBy(params);
    
    // Calculate pagination
    const skip = (params.page - 1) * params.pageSize;
    const take = params.pageSize;
    
    // Get total count
    const total = await prisma.lead.count({ where });
    
    // Get paginated leads with includes
    const leads = await prisma.lead.findMany({
      where,
      orderBy,
      skip,
      take,
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
            country: true,
            industry: true,
            size: true,
          },
        },
        assignments: {
          where: {
            unassignedAt: null,
          },
          take: 1,
          orderBy: {
            assignedAt: 'desc',
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        interactions: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            channel: true,
            outcome: true,
            createdAt: true,
            completedAt: true,
          },
        },
        handoffs: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            toTeam: true,
            status: true,
            createdAt: true,
          },
        },
        scoringRuns: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            score: true,
            scoreData: true,
            version: true,
            createdAt: true,
          },
        },
      },
    });
    
    // Get primary contact for each lead's account
    const accountIds = leads.map(lead => lead.accountId);
    const primaryContacts = await prisma.contact.findMany({
      where: {
        accountId: { in: accountIds },
        isPrimary: true,
        deletedAt: null,
      },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        title: true,
      },
    });
    
    // Create a map for quick lookup
    const contactsByAccount = new Map(
      primaryContacts.map(c => [c.accountId, c])
    );
    
    // For accounts without a primary contact, get the first contact as fallback
    const accountsWithoutPrimary = accountIds.filter(id => !contactsByAccount.has(id));
    if (accountsWithoutPrimary.length > 0) {
      const fallbackContacts = await prisma.contact.findMany({
        where: {
          accountId: { in: accountsWithoutPrimary },
          deletedAt: null,
        },
        select: {
          id: true,
          accountId: true,
          fullName: true,
          email: true,
          phone: true,
          title: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        distinct: ['accountId'],
      });
      
      // Add fallback contacts to the map
      fallbackContacts.forEach(c => {
        if (!contactsByAccount.has(c.accountId)) {
          contactsByAccount.set(c.accountId, c);
        }
      });
    }
    
    // Format response
    const items = leads.map(lead => {
      const assignment = lead.assignments[0];
      const interaction = lead.interactions[0];
      const handoff = lead.handoffs[0];
      const scoring = lead.scoringRuns[0];
      const contact = contactsByAccount.get(lead.accountId);
      
      // Extract probability from scoreDetails or enrichedData
      let probability: number | undefined;
      if (lead.scoreDetails && typeof lead.scoreDetails === 'object' && lead.scoreDetails !== null) {
        const details = lead.scoreDetails as Record<string, unknown>;
        probability = (typeof details.probability_value === 'number' ? details.probability_value : undefined) || 
                      (typeof details.probability === 'number' ? details.probability : undefined);
      }
      
      // Extract trigger from enrichedData
      let trigger: string | undefined;
      if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
        const enriched = lead.enrichedData as Record<string, unknown>;
        trigger = typeof enriched.trigger === 'string' ? enriched.trigger : undefined;
      }
      
      // Extract summary from enrichedData
      let summary: string | undefined;
      if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
        const enriched = lead.enrichedData as Record<string, unknown>;
        summary = typeof enriched.summary === 'string' ? enriched.summary : undefined;
      }
      
      // Extract score components from scoreDetails
      let scoreTrigger: number | undefined;
      let scoreProbability: number | undefined;
      if (lead.scoreDetails && typeof lead.scoreDetails === 'object' && lead.scoreDetails !== null) {
        const details = lead.scoreDetails as Record<string, unknown>;
        scoreTrigger = typeof details.trigger === 'number' ? details.trigger : undefined;
        scoreProbability = typeof details.probability === 'number' ? details.probability : undefined;
      }
      
      return {
        lead: {
          id: lead.id,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
          status: lead.status,
          trigger,
          probability,
          scoreTrigger,
          scoreProbability,
          scoreFinal: lead.score,
          summary,
          priority: lead.priority,
          tags: lead.tags,
        },
        company: {
          accountId: lead.account.id,
          accountName: lead.account.name,
          domain: lead.account.domain,
          country: lead.account.country,
          industry: lead.account.industry,
          size: lead.account.size,
        },
        source: {
          sourceId: lead.source.id,
          sourceKey: lead.source.name,
          sourceType: lead.source.type,
        },
        primaryContact: contact ? {
          contactId: contact.id,
          name: contact.fullName,
          email: contact.email,
          phone: contact.phone,
          role: contact.title,
        } : null,
        assignment: assignment ? {
          assignedToUserId: assignment.user.id,
          assignedToName: assignment.user.name,
          assignedToEmail: assignment.user.email,
          assignedAt: assignment.assignedAt,
        } : null,
        lastInteraction: interaction ? {
          interactionId: interaction.id,
          lastInteractionAt: interaction.completedAt || interaction.createdAt,
          lastInteractionChannel: interaction.channel,
          lastInteractionOutcome: interaction.outcome,
        } : null,
        handoff: handoff ? {
          handoffId: handoff.id,
          handoffTeam: handoff.toTeam,
          handoffStatus: handoff.status,
          handoffAt: handoff.createdAt,
        } : null,
        scoring: scoring ? {
          latestScore: scoring.score,
          scoringVersion: scoring.version,
          scoredAt: scoring.createdAt,
        } : null,
      };
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / params.pageSize);
    
    return NextResponse.json({
      items,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages,
      },
      filters: {
        status: params.status,
        source: params.source,
        minScore: params.minScore,
        maxScore: params.maxScore,
        country: params.country,
        q: params.q,
      },
      sort: {
        field: params.sort,
        order: params.order,
      },
    });
    
  } catch (error) {
    console.error('Error fetching leads:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
