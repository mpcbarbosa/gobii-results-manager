import { requireAdminAuth } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateDomainSuggestion, meetsConfidenceThreshold, isInvalidDomain } from '@/lib/utils/domain-suggestion';

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

interface UpdateResult {
  accountId: string;
  oldDomain: string | null;
  newDomain: string | null;
  confidence: string;
  source: string;
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
    
    if (!body.accountIds || !Array.isArray(body.accountIds)) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected { accountIds: [...] }' },
        { status: 400 }
      );
    }
    
    const accountIds: string[] = body.accountIds;
    const minConfidence = (body.minConfidence || 'high') as 'low' | 'medium' | 'high';
    const overwriteInvalid = body.overwriteInvalid !== undefined ? body.overwriteInvalid : true;
    const overwriteValid = body.overwriteValid !== undefined ? body.overwriteValid : false;
    
    // Validate max 200 accounts
    if (accountIds.length > 200) {
      return NextResponse.json(
        { error: 'Maximum 200 accountIds per request' },
        { status: 400 }
      );
    }
    
    const updated: UpdateResult[] = [];
    const skipped: SkippedResult[] = [];
    
    for (const accountId of accountIds) {
      try {
        // Validate accountId
        if (!accountId || typeof accountId !== 'string') {
          skipped.push({
            accountId: accountId || 'unknown',
            reason: 'Invalid accountId',
          });
          continue;
        }
        
        // Generate suggestion server-side (do not trust client)
        const suggestion = await generateDomainSuggestion(accountId);
        
        // Check if suggestion exists
        if (!suggestion.suggestedDomain) {
          skipped.push({
            accountId,
            reason: 'No domain suggestion available',
          });
          continue;
        }
        
        // Check confidence threshold
        if (!meetsConfidenceThreshold(suggestion.confidence, minConfidence)) {
          skipped.push({
            accountId,
            reason: `Confidence ${suggestion.confidence} below threshold ${minConfidence}`,
          });
          continue;
        }
        
        // Check overwrite rules
        const currentDomainIsInvalid = isInvalidDomain(suggestion.currentDomain);
        const currentDomainIsValid = suggestion.currentDomain !== null && !currentDomainIsInvalid;
        
        if (currentDomainIsInvalid && !overwriteInvalid) {
          skipped.push({
            accountId,
            reason: 'Current domain is invalid but overwriteInvalid=false',
          });
          continue;
        }
        
        if (currentDomainIsValid && !overwriteValid) {
          skipped.push({
            accountId,
            reason: 'Current domain is valid but overwriteValid=false',
          });
          continue;
        }
        
        // Update the account
        await prisma.account.update({
          where: { id: accountId },
          data: { domain: suggestion.suggestedDomain },
        });
        
        updated.push({
          accountId,
          oldDomain: suggestion.currentDomain,
          newDomain: suggestion.suggestedDomain,
          confidence: suggestion.confidence || 'unknown',
          source: suggestion.source || 'unknown',
        });
        
      } catch (error) {
        console.error(`Error applying suggestion for account ${accountId}:`, error);
        skipped.push({
          accountId,
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
    console.error('Apply suggested domains error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


