import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isInvalidDomain } from '@/lib/utils/domain-suggestion';
import { Prisma } from '@prisma/client';

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

export async function POST(request: NextRequest) {
  
  const auth = requireAdminAuth(request);
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
    
    const sourceAccountId = body.sourceAccountId;
    const targetAccountId = body.targetAccountId;
    const deleteSource = body.deleteSource !== undefined ? body.deleteSource : true;
    
    // Validate input
    if (!sourceAccountId || typeof sourceAccountId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid sourceAccountId' },
        { status: 400 }
      );
    }
    
    if (!targetAccountId || typeof targetAccountId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid targetAccountId' },
        { status: 400 }
      );
    }
    
    if (sourceAccountId === targetAccountId) {
      return NextResponse.json(
        { error: 'Source and target accounts cannot be the same' },
        { status: 400 }
      );
    }
    
    // Fetch both accounts
    const [sourceAccount, targetAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: sourceAccountId } }),
      prisma.account.findUnique({ where: { id: targetAccountId } }),
    ]);
    
    if (!sourceAccount) {
      return NextResponse.json(
        { error: 'Source account not found' },
        { status: 404 }
      );
    }
    
    if (!targetAccount) {
      return NextResponse.json(
        { error: 'Target account not found' },
        { status: 404 }
      );
    }
    
    // Perform merge in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const counts = {
        leads: 0,
        contacts: 0,
      };
      
      // 1. Repoint all leads
      const leadsUpdate = await tx.lead.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });
      counts.leads = leadsUpdate.count;
      
      // 2. Repoint all contacts
      const contactsUpdate = await tx.contact.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });
      counts.contacts = contactsUpdate.count;
      
      // 3. Merge account fields safely
      const mergedData: Record<string, unknown> = {
        name: targetAccount.name || sourceAccount.name,
        nameNormalized: targetAccount.nameNormalized || sourceAccount.nameNormalized,
        website: targetAccount.website || sourceAccount.website,
        industry: targetAccount.industry || sourceAccount.industry,
        size: targetAccount.size || sourceAccount.size,
        location: targetAccount.location || sourceAccount.location,
        country: targetAccount.country || sourceAccount.country,
        description: targetAccount.description || sourceAccount.description,
        linkedinUrl: targetAccount.linkedinUrl || sourceAccount.linkedinUrl,
      };
      
      // Handle domain: keep target if valid, else take source if valid
      if (targetAccount.domain && !isInvalidDomain(targetAccount.domain)) {
        mergedData.domain = targetAccount.domain;
      } else if (sourceAccount.domain && !isInvalidDomain(sourceAccount.domain)) {
        mergedData.domain = sourceAccount.domain;
      } else {
        mergedData.domain = targetAccount.domain; // Keep target even if invalid
      }
      
      // Update target account with merged data
      await tx.account.update({
        where: { id: targetAccountId },
        data: mergedData,
      });
      
      // 4. Delete or soft-delete source account
      if (deleteSource) {
        // Use soft delete
        await tx.account.update({
          where: { id: sourceAccountId },
          data: { deletedAt: new Date() },
        });
      }
      
      return counts;
    });
    
    return NextResponse.json({
      success: true,
      sourceAccountId,
      targetAccountId,
      deleted: deleteSource,
      counts: result,
    });
    
  } catch (error) {
    console.error('Merge accounts error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


