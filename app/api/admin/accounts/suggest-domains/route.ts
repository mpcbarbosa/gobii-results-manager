import { requireAdminAuth } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateDomainSuggestion, meetsConfidenceThreshold, isInvalidDomain, type Mode } from '@/lib/utils/domain-suggestion';

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
      parseInt(searchParams.get('take') || '50', 10),
      200
    );
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const mode = (searchParams.get('mode') || 'missing') as Mode;
    const minConfidence = (searchParams.get('minConfidence') || 'medium') as 'low' | 'medium' | 'high';
    
    // Build where clause based on mode
    let where = {};
    if (mode === 'missing') {
      where = { domain: null };
    } else if (mode === 'all') {
      where = {};
    } else if (mode === 'invalid' || mode === 'missing_or_invalid') {
      // For invalid modes, we need to fetch all and filter in-memory
      // since Prisma doesn't support complex string validation in where clause
      where = {};
    }
    
    // Get total count
    const count = await prisma.account.count({ where });
    
    // Get accounts (fetch more if we need to filter by invalid)
    const fetchLimit = (mode === 'invalid' || mode === 'missing_or_invalid') ? take * 3 : take;
    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true,
        domain: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: fetchLimit,
      skip,
    });
    
    // Filter accounts based on mode
    let filteredAccounts = accounts;
    if (mode === 'invalid') {
      filteredAccounts = accounts.filter(a => isInvalidDomain(a.domain));
    } else if (mode === 'missing_or_invalid') {
      filteredAccounts = accounts.filter(a => a.domain === null || isInvalidDomain(a.domain));
    }
    
    // Limit to requested take after filtering
    filteredAccounts = filteredAccounts.slice(0, take);
    
    // Generate suggestions for each account
    const items = [];
    for (const account of filteredAccounts) {
      try {
        const suggestion = await generateDomainSuggestion(account.id);
        
        // Filter by confidence if suggestion exists
        if (suggestion.suggestedDomain) {
          if (meetsConfidenceThreshold(suggestion.confidence, minConfidence)) {
            items.push(suggestion);
          }
        } else {
          // Include accounts with no suggestion
          items.push(suggestion);
        }
      } catch (error) {
        console.error(`Error generating suggestion for account ${account.id}:`, error);
      }
    }
    
    return NextResponse.json({
      success: true,
      take,
      skip,
      count,
      items,
    });
    
  } catch (error) {
    console.error('Suggest domains error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

