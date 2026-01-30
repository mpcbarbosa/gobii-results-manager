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

export async function GET(request: NextRequest) {
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
      parseInt(searchParams.get('take') || '50', 10),
      100
    );
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const accountId = searchParams.get('accountId') || undefined;
    const q = searchParams.get('q') || undefined;
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    
    // Build where clause
    const where: Record<string, unknown> = {};
    
    // Filter by deleted status
    if (!includeDeleted) {
      where.deletedAt = null;
    }
    
    // Filter by accountId
    if (accountId) {
      where.accountId = accountId;
    }
    
    // Text search in account name or lead enrichedData
    if (q) {
      where.OR = [
        {
          account: {
            name: { contains: q, mode: 'insensitive' as const },
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
        enrichedData: true,
        accountId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        account: {
          select: {
            name: true,
            domain: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take,
      skip,
    });
    
    // Format items
    const items = leads.map(lead => {
      // Extract summary from enrichedData
      let summary: string | undefined;
      if (lead.enrichedData && typeof lead.enrichedData === 'object' && lead.enrichedData !== null) {
        const enriched = lead.enrichedData as Record<string, unknown>;
        summary = typeof enriched.summary === 'string' ? enriched.summary : undefined;
      }
      
      return {
        id: lead.id,
        dedupeKey: lead.dedupeKey,
        status: lead.status,
        score: lead.score,
        summary,
        accountId: lead.accountId,
        accountName: lead.account.name,
        accountDomain: lead.account.domain,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        deletedAt: lead.deletedAt,
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
