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

interface DomainUpdate {
  accountId: string;
  domain: string | null;
}

interface UpdateResult {
  accountId: string;
  oldDomain: string | null;
  newDomain: string | null;
}

interface SkippedResult {
  accountId: string;
  reason: string;
}

export async function POST(request: NextRequest) {
  
  const req = arguments[0] as Request;
  const auth = requireAdminAuth(req);
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
    // Parse and validate request body
    const body = await request.json();
    
    if (!body.updates || !Array.isArray(body.updates)) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected { updates: [...] }' },
        { status: 400 }
      );
    }
    
    const updates: DomainUpdate[] = body.updates;
    const updated: UpdateResult[] = [];
    const skipped: SkippedResult[] = [];
    
    for (const update of updates) {
      try {
        // Validate accountId
        if (!update.accountId || typeof update.accountId !== 'string') {
          skipped.push({
            accountId: update.accountId || 'unknown',
            reason: 'Invalid accountId',
          });
          continue;
        }
        
        // Validate and normalize domain
        let normalizedDomain: string | null = null;
        if (update.domain !== null) {
          if (typeof update.domain !== 'string') {
            skipped.push({
              accountId: update.accountId,
              reason: 'Domain must be a string or null',
            });
            continue;
          }
          
          // Check for spaces
          if (update.domain.includes(' ')) {
            skipped.push({
              accountId: update.accountId,
              reason: 'Domain cannot contain spaces',
            });
            continue;
          }
          
          // Normalize: lowercase and trim
          normalizedDomain = update.domain.toLowerCase().trim();
          
          // Reject empty strings after trim
          if (normalizedDomain === '') {
            normalizedDomain = null;
          }
        }
        
        // Find the account
        const account = await prisma.account.findUnique({
          where: { id: update.accountId },
          select: { id: true, domain: true },
        });
        
        if (!account) {
          skipped.push({
            accountId: update.accountId,
            reason: 'Account not found',
          });
          continue;
        }
        
        // Update the account
        await prisma.account.update({
          where: { id: update.accountId },
          data: { domain: normalizedDomain },
        });
        
        updated.push({
          accountId: update.accountId,
          oldDomain: account.domain,
          newDomain: normalizedDomain,
        });
        
      } catch (error) {
        console.error(`Error updating account ${update.accountId}:`, error);
        skipped.push({
          accountId: update.accountId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      updatedCount: updated.length,
      updated,
      skipped,
    });
    
  } catch (error) {
    console.error('Backfill domain error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


