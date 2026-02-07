import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from '@/lib/prisma';

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

export async function POST(request: Request) {
  // Authenticate (supports Bearer token and session cookie)
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }
  
  try {
    // Parse and validate request body
    const body = await request.json();
    
    if (!body.updates || !Array.isArray(body.updates)) {
      return Response.json(
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
        
        // Update the account and lock domain
        await prisma.account.update({
          where: { id: update.accountId },
          data: { 
            domain: normalizedDomain,
            domainLocked: true,
          },
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
    
      return Response.json({
      success: true,
      updatedCount: updated.length,
      updated,
      skipped,
    });
    
  } catch (error) {
    console.error('Backfill domain error:', error);
    
      return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


