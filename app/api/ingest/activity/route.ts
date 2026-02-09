import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveLead } from '@/lib/utils/resolveLead';
import { Prisma } from '@prisma/client';

// Categories that trigger automatic status change from NEW to CONTACTED
const AUTO_CONTACT_CATEGORIES = ['RFP', 'EXPANSION'];

// Terminal statuses that should not be changed
const TERMINAL_STATUSES = ['WON', 'LOST', 'DISCARDED'];

/**
 * POST /api/ingest/activity
 * 
 * Allows Gobii agents to create SYSTEM activities for existing leads
 * 
 * Authentication: APP_INGEST_TOKEN
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.APP_INGEST_TOKEN;
    
    if (!expectedToken) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured' },
        { status: 500 }
      );
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7).trim();
    if (token !== expectedToken) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }
    
    // 2. Parse and validate payload
    const body = await request.json();
    
    if (!body.company || (!body.company.domain && !body.company.name)) {
      return NextResponse.json(
        { success: false, error: 'Missing company.domain or company.name' },
        { status: 400 }
      );
    }
    
    if (!body.activity || !body.activity.title) {
      return NextResponse.json(
        { success: false, error: 'Missing activity.title' },
        { status: 400 }
      );
    }
    
    const { company, activity } = body;
    
    // 3. Resolve lead
    const lead = await resolveLead(company);
    
    if (!lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found for this company' },
        { status: 404 }
      );
    }
    
    // 4. Check for duplicates (last 30 days)
    if (activity.meta) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const existingActivity = await prisma.activity.findFirst({
        where: {
          leadId: lead.id,
          type: 'SYSTEM',
          createdAt: {
            gte: thirtyDaysAgo,
          },
          // Check meta fields for duplication
          ...(activity.meta.agent && {
            notes: {
              contains: activity.meta.agent,
            },
          }),
        },
      });
      
      // More precise duplicate check using meta JSON
      if (existingActivity) {
        // Parse notes to check if it's truly a duplicate
        // For now, we'll do a simple check - in production you might store meta separately
        const isDuplicate = 
          activity.meta.agent &&
          activity.meta.category &&
          activity.meta.source_url &&
          existingActivity.notes?.includes(activity.meta.agent) &&
          existingActivity.notes?.includes(activity.meta.category) &&
          existingActivity.notes?.includes(activity.meta.source_url);
        
        if (isDuplicate) {
          return NextResponse.json({
            success: true,
            duplicated: true,
          });
        }
      }
    }
    
    // 5. Determine if status should auto-change
    const shouldAutoContact = 
      lead.status === 'NEW' &&
      activity.meta?.category &&
      AUTO_CONTACT_CATEGORIES.includes(activity.meta.category);
    
    const isTerminalStatus = TERMINAL_STATUSES.includes(lead.status);
    
    // 6. Create activity and update lead in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Format notes with meta information
      let formattedNotes = activity.notes || '';
      if (activity.meta) {
        formattedNotes += `\n\n---\nAgent: ${activity.meta.agent || 'unknown'}`;
        if (activity.meta.category) formattedNotes += `\nCategory: ${activity.meta.category}`;
        if (activity.meta.confidence) formattedNotes += `\nConfidence: ${activity.meta.confidence}`;
        if (activity.meta.source_url) formattedNotes += `\nSource: ${activity.meta.source_url}`;
        if (activity.meta.detected_at) formattedNotes += `\nDetected: ${activity.meta.detected_at}`;
      }
      
      // Get system user (or create if doesn't exist)
      let systemUser = await tx.user.findFirst({
        where: { email: 'system@gobii.internal' },
      });
      
      if (!systemUser) {
        systemUser = await tx.user.create({
          data: {
            email: 'system@gobii.internal',
            name: 'Gobii System',
            role: 'ADMIN',
            isActive: true,
          },
        });
      }
      
      // Create the activity
      const newActivity = await tx.activity.create({
        data: {
          leadId: lead.id,
          type: 'SYSTEM',
          title: activity.title,
          notes: formattedNotes,
          createdById: systemUser.id,
        },
      });
      
      // Update lead
      const updateData: Prisma.LeadUpdateInput = {
        lastActivityAt: new Date(),
      };
      
      if (shouldAutoContact && !isTerminalStatus) {
        updateData.status = 'CONTACTED';
      }
      
      await tx.lead.update({
        where: { id: lead.id },
        data: updateData,
      });
      
      // Create status history if status changed
      if (shouldAutoContact && !isTerminalStatus) {
        await tx.leadStatusHistory.create({
          data: {
            leadId: lead.id,
            fromStatus: 'NEW',
            toStatus: 'CONTACTED',
            reason: `Automatically changed to CONTACTED by agent activity (category: ${activity.meta?.category})`,
            changedById: systemUser.id,
          },
        });
      }
      
      return newActivity;
    });
    
    return NextResponse.json({
      success: true,
      leadId: lead.id,
      activityId: result.id,
    });
    
  } catch (error) {
    console.error('Error ingesting activity:', error);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
