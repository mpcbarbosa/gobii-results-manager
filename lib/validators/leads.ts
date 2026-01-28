import { z } from 'zod';
import { LeadStatus } from '@prisma/client';

// Valid sort fields
const sortFields = ['created_at', 'updated_at', 'score', 'probability'] as const;
const sortOrders = ['asc', 'desc'] as const;

// Query params schema for GET /api/leads
export const leadsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  
  // Sorting
  sort: z.enum(sortFields).default('created_at'),
  order: z.enum(sortOrders).default('desc'),
  
  // Filters
  status: z.string().optional(), // Can be comma-separated: "NEW,QUALIFIED"
  source: z.string().optional(), // Source key
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  minProbability: z.coerce.number().min(0).max(1).optional(),
  maxProbability: z.coerce.number().min(0).max(1).optional(),
  country: z.string().optional(),
  q: z.string().optional(), // Text search
  assignedTo: z.string().uuid().optional(), // User ID
  unassigned: z.enum(['true', 'false']).optional(),
  handoffStatus: z.string().optional(),
  from: z.string().datetime().optional(), // ISO date
  to: z.string().datetime().optional(), // ISO date
});

export type LeadsQueryParams = z.infer<typeof leadsQuerySchema>;

/**
 * Parse status filter (can be comma-separated)
 */
export function parseStatusFilter(status?: string): LeadStatus[] | undefined {
  if (!status) return undefined;
  
  const statuses = status.split(',').map(s => s.trim());
  const validStatuses = statuses.filter(s => 
    Object.values(LeadStatus).includes(s as LeadStatus)
  ) as LeadStatus[];
  
  return validStatuses.length > 0 ? validStatuses : undefined;
}

/**
 * Build Prisma where clause from query params
 */
export function buildLeadsWhereClause(params: LeadsQueryParams) {
  const where: any = {
    deletedAt: null, // Exclude soft deleted
  };
  
  // Status filter
  if (params.status) {
    const statuses = parseStatusFilter(params.status);
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }
  }
  
  // Source filter
  if (params.source) {
    where.source = {
      name: params.source,
    };
  }
  
  // Score filters
  if (params.minScore !== undefined || params.maxScore !== undefined) {
    where.score = {};
    if (params.minScore !== undefined) {
      where.score.gte = params.minScore;
    }
    if (params.maxScore !== undefined) {
      where.score.lte = params.maxScore;
    }
  }
  
  // Probability filters (stored in scoreDetails JSON)
  // Note: This requires JSON filtering which may not be efficient
  // Consider adding a dedicated probability column if this is frequently used
  
  // Country filter
  if (params.country) {
    where.account = {
      country: params.country,
      deletedAt: null,
    };
  }
  
  // Text search (q)
  if (params.q) {
    where.OR = [
      { account: { name: { contains: params.q, mode: 'insensitive' } } },
      { enrichedData: { path: ['trigger'], string_contains: params.q } },
    ];
  }
  
  // Assignment filters
  if (params.assignedTo) {
    where.assignments = {
      some: {
        userId: params.assignedTo,
        unassignedAt: null,
      },
    };
  }
  
  if (params.unassigned === 'true') {
    where.assignments = {
      none: {
        unassignedAt: null,
      },
    };
  }
  
  // Handoff status filter
  if (params.handoffStatus) {
    where.handoffs = {
      some: {
        status: params.handoffStatus,
      },
    };
  }
  
  // Date range filter
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      where.createdAt.gte = new Date(params.from);
    }
    if (params.to) {
      where.createdAt.lte = new Date(params.to);
    }
  }
  
  return where;
}

/**
 * Build Prisma orderBy clause from query params
 */
export function buildLeadsOrderBy(params: LeadsQueryParams) {
  const orderBy: any = {};
  
  switch (params.sort) {
    case 'created_at':
      orderBy.createdAt = params.order;
      break;
    case 'updated_at':
      orderBy.updatedAt = params.order;
      break;
    case 'score':
      orderBy.score = params.order;
      break;
    case 'probability':
      // Probability is in scoreDetails JSON, may need special handling
      orderBy.score = params.order; // Fallback to score
      break;
    default:
      orderBy.createdAt = 'desc';
  }
  
  return orderBy;
}
