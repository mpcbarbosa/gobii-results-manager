import { requireAdminAuth } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Authentication middleware
function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env.APP_ADMIN_TOKEN;
  
  if (!expectedToken) {
    console.error('APP_ADMIN_TOKEN not configured');
    return false;
  }
  
  return token === expectedToken;
}

/**
 * Escape CSV field (Excel PT compatible)
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // If contains semicolon, quotes, or newline, wrap in quotes and escape quotes
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

export async function GET(request: NextRequest) {
  
  const auth = requireAdminAuth();
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }
// Authenticate
  if (!authenticate(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const take = Math.min(
      parseInt(searchParams.get('take') || '200', 10),
      5000
    );
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const accountId = searchParams.get('accountId') || undefined;
    const status = searchParams.get('status') || undefined;
    const source = searchParams.get('source') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const q = searchParams.get('q') || undefined;
    const showDeleted = searchParams.get('showDeleted') === 'true';
    
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
    
    // Filter by status
    if (status) {
      where.status = status;
    }
    
    // Filter by source
    if (source) {
      where.source = {
        name: source,
      };
    }
    
    // Filter by date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
      }
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
          enrichedData: {
            path: ['summary'],
            string_contains: q,
          },
        },
      ];
    }
    
    // Get leads
    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        dedupeKey: true,
        status: true,
        score: true,
        scoreDetails: true,
        enrichedData: true,
        accountId: true,
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
            name: true,
          },
        },
        account: {
          select: {
            name: true,
            domain: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
      skip,
    });
    
    // Build CSV
    const rows: string[] = [];
    
    // Header row (Excel PT: semicolon separator)
    rows.push('id;createdAt;updatedAt;status;score;trigger;probability;summary;accountId;accountName;accountDomain;dedupeKey;sourceKey;deletedAt;notes;owner;nextActionAt;seenCount;lastSeenAt');
    
    // Data rows
    for (const lead of leads) {
      // Extract data from enrichedData
      let summary = '';
      let trigger = '';
      if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
        const enriched = lead.enrichedData as Record<string, unknown>;
        summary = typeof enriched.summary === 'string' ? enriched.summary : '';
        trigger = typeof enriched.trigger === 'string' ? enriched.trigger : '';
      }
      
      // Extract probability from scoreDetails
      let probability = '';
      if (lead.scoreDetails && typeof lead.scoreDetails === 'object' && lead.scoreDetails !== null) {
        const details = lead.scoreDetails as Record<string, unknown>;
        const probValue = (typeof details.probability_value === 'number' ? details.probability_value : undefined) || 
                         (typeof details.probability === 'number' ? details.probability : undefined);
        if (probValue !== undefined) {
          probability = String(probValue);
        }
      }
      
      const row = [
        escapeCsvField(lead.id),
        escapeCsvField(lead.createdAt.toISOString()),
        escapeCsvField(lead.updatedAt.toISOString()),
        escapeCsvField(lead.status),
        escapeCsvField(lead.score),
        escapeCsvField(trigger),
        escapeCsvField(probability),
        escapeCsvField(summary),
        escapeCsvField(lead.accountId),
        escapeCsvField(lead.account.name),
        escapeCsvField(lead.account.domain),
        escapeCsvField(lead.dedupeKey),
        escapeCsvField(lead.source.name),
        escapeCsvField(lead.deletedAt ? lead.deletedAt.toISOString() : ''),
        escapeCsvField(lead.notes),
        escapeCsvField(lead.owner),
        escapeCsvField(lead.nextActionAt ? lead.nextActionAt.toISOString() : ''),
        escapeCsvField(lead.seenCount),
        escapeCsvField(lead.lastSeenAt ? lead.lastSeenAt.toISOString() : ''),
      ].join(';');
      
      rows.push(row);
    }
    
    const csv = rows.join('\n');
    
    // Add UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    const csvWithBom = bom + csv;
    
    // Return CSV response
    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads_export.csv"',
      },
    });
    
  } catch (error) {
    console.error('Export leads error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

