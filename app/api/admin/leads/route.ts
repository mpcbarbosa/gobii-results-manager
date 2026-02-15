import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  // Authenticate (supports Bearer token and session cookie)
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }
  
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const take = Math.min(
      parseInt(searchParams.get('take') || '50', 10),
      200
    );
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const accountId = searchParams.get('accountId') || undefined;
    const source = searchParams.get('source') || undefined;
    const minScore = searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) : undefined;
    const maxScore = searchParams.get('maxScore') ? parseFloat(searchParams.get('maxScore')!) : undefined;
    const q = searchParams.get('q') || undefined;
    const showDeleted = searchParams.get('showDeleted') === 'true';
    const sort = searchParams.get('sort') || 'updated';
    const status = searchParams.get('status') || undefined;
    const ownerId = searchParams.get('ownerId') || undefined;
    const onlyUnassigned = searchParams.get('onlyUnassigned') === 'true';
    
    // Build where clause
    const where: Record<string, unknown> = {};
    
    // Filter by deleted status
    if (!showDeleted) {
      where.deletedAt = null;
    }
    
    // Filter by accountId
    if (accountId) {
      where.accountId = accountId;
    }
    
    // Filter by source
    if (source) {
      where.source = {
        name: source,
      };
    }
    
    // Filter by score range
    if (minScore !== undefined || maxScore !== undefined) {
      where.score = {};
      if (minScore !== undefined) {
        (where.score as Record<string, unknown>).gte = minScore;
      }
      if (maxScore !== undefined) {
        (where.score as Record<string, unknown>).lte = maxScore;
      }
    }
    
    // Filter by status
    if (status) {
      where.status = status;
    }

    // Filter by owner
    if (ownerId) {
      where.ownerId = ownerId;
    }

    // Only unassigned
    if (onlyUnassigned) {
      where.ownerId = null;
    }

    // Text search in multiple fields
    if (q) {
      where.OR = [
        {
          account: {
            name: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          account: {
            domain: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          account: {
            website: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          enrichedData: {
            path: ['summary'],
            string_contains: q,
          },
        },
      ];
    }
    
    // Get total count
    const count = await prisma.lead.count({ where });
    
    // Get leads with account info
    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        dedupeKey: true,
        status: true,
        score: true,
        scoreDetails: true,
        enrichedData: true,
        rawData: true,
        accountId: true,
        title: true,
        notes: true,
        owner: true,
        nextActionAt: true,
        seenCount: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
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
          },
        },
      },
      orderBy: sort === 'hot' ? [
        { lastSeenAt: 'desc' },
        { seenCount: 'desc' },
        { updatedAt: 'desc' },
      ] : {
        updatedAt: 'desc',
      },
      take,
      skip,
    });
    
    // Format items
    const items = leads.map(lead => {
      // Extract data from enrichedData
      let summary: string | undefined;
      let trigger: string | undefined;
      let _externalId: string | undefined;
      if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
        const enriched = lead.enrichedData as Record<string, unknown>;
        summary = pickString(
  enriched.summary,
  getStr(getObj(lead.rawData), "summary"),
  getStr(getObj(getObj(lead.rawData)?.enriched), "summary"),
  getStr(getObj(getObj(lead.rawData)?.payload), "summary")
);

trigger = pickString(
  enriched.trigger,
  getStr(getObj(lead.rawData), "trigger"),
  getStr(getObj(lead.rawData), "score_trigger"),
  getStr(getObj(getObj(lead.rawData)?.score), "trigger")
);
        _externalId = typeof enriched.external_id === 'string' ? enriched.external_id : undefined;
      }
      
      function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim() !== "") return v;
  return undefined;
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) if (typeof v === "number" && !Number.isNaN(v)) return v;
  return undefined;
}

function getObj(v: unknown): Record<string, unknown> | undefined {
  return (v && typeof v === "object") ? (v as Record<string, unknown>) : undefined;
}

function getStr(o: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = o ? o[key] : undefined;
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function getNum(o: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = o ? o[key] : undefined;
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

function normalizeProbabilityValue(raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  // accept 0..1, 0..100
  const p = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, p));
}

// Extract data from scoreDetails
      let probability: number | undefined;
      let scoreTrigger: number | undefined;
      let scoreProbability: number | undefined;
      if (lead.scoreDetails && typeof lead.scoreDetails === 'object' && lead.scoreDetails !== null) {
        const details = lead.scoreDetails as Record<string, unknown>;
        const probValRaw = pickNumber(details.probability_value, details.probability);
const probVal = normalizeProbabilityValue(probValRaw);

probability = probVal;

scoreTrigger = typeof details.trigger === "number" ? details.trigger : undefined;

// Some sources use "probability" as score (0-20). If it looks like a score, keep it here.
const probScoreCandidate = typeof details.probability === "number" ? details.probability : undefined;
scoreProbability =
  (probScoreCandidate !== undefined && probScoreCandidate > 1 && probScoreCandidate <= 20)
    ? probScoreCandidate
    : (getNum(details as Record<string, unknown>, "score_probability"));
      }
      
      // Extract contact from rawData if available
      let contactName: string | undefined;
      let contactEmail: string | undefined;
      if (lead.rawData && typeof lead.rawData === 'object' && lead.rawData !== null) {
        const raw = lead.rawData as Record<string, unknown>;
        if (raw.contact && typeof raw.contact === 'object') {
          const contact = raw.contact as Record<string, unknown>;
          contactName = typeof contact.name === 'string' ? contact.name : 
                       (typeof contact.full_name === 'string' ? contact.full_name : undefined);
          contactEmail = typeof contact.email === 'string' ? contact.email : undefined;
        }
      }
      
      return {
        id: lead.id,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        summary,
        trigger,
        probability,
        score_trigger: scoreTrigger,
        score_probability: scoreProbability,
        score_final: lead.score,
        source: lead.source.name,
        accountId: lead.accountId,
        notes: lead.notes,
        owner: lead.owner,
        nextActionAt: lead.nextActionAt,
        seenCount: lead.seenCount,
        lastSeenAt: lead.lastSeenAt,
        company: {
          name: lead.account.name,
          domain: lead.account.domain,
          website: lead.account.website,
        },
        contact: contactName || contactEmail ? {
          name: contactName,
          email: contactEmail,
        } : null,
        account: {
          id: lead.account.id,
          name: lead.account.name,
          domain: lead.account.domain,
        },
      };
    });
    
    return NextResponse.json({
      success: true,
      take,
      skip,
      count,
      items,
    });
    
  } catch (error) {
    console.error('List leads error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



