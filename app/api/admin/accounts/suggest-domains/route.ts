import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateDomainSuggestion, meetsConfidenceThreshold } from '@/lib/utils/domain-suggestion';

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
      200
    );
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const mode = (searchParams.get('mode') || 'missing') as 'missing' | 'all';
    const minConfidence = (searchParams.get('minConfidence') || 'medium') as 'low' | 'medium' | 'high';
    
    // Build where clause based on mode
    const where = mode === 'missing' ? { domain: null } : {};
    
    // Get total count
    const count = await prisma.account.count({ where });
    
    // Get accounts
    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take,
      skip,
    });
    
    // Generate suggestions for each account
    const items = [];
    for (const account of accounts) {
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
