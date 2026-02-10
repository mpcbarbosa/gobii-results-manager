import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import prisma from '@/lib/prisma';
import { ActivityType, LeadStatus, Prisma } from '@prisma/client';

// GET /api/admin/leads/[id]/activities - Get all activities for a lead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin authentication
    const auth = requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Get all activities for the lead
    const activities = await prisma.activity.findMany({
      where: { leadId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/leads/[id]/activities - Create a new activity
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin authentication
    const auth = requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Validate required fields
    const { type, title, notes, dueAt } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: type and title are required' },
        { status: 400 }
      );
    }

    // Validate activity type
    if (!Object.values(ActivityType).includes(type)) {
      return NextResponse.json(
        { error: `Invalid activity type. Must be one of: ${Object.values(ActivityType).join(', ')}` },
        { status: 400 }
      );
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Get the first admin user (for now, we'll use the first admin as the creator)
    // In a real system, you'd extract the user from the session/token
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'No admin user found in system' },
        { status: 500 }
      );
    }

    // Determine if this is a human activity (not SYSTEM)
    const isHumanActivity = type !== ActivityType.SYSTEM;

    // Check if lead status should change from NEW to CONTACTED
    const shouldAutoContact = 
      isHumanActivity && 
      lead.status === LeadStatus.NEW;

    // Create activity and update lead in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the activity
      const activity = await tx.activity.create({
        data: {
          leadId: id,
          type,
          title,
          notes: notes || null,
          dueAt: dueAt ? new Date(dueAt) : null,
          createdById: adminUser.id,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Update lead's lastActivityAt and potentially status
      const now = new Date();
      const updateData: {
        lastActivityAt: Date;
        lastHumanActivityAt?: Date;
        status?: LeadStatus;
      } = {
        lastActivityAt: now,
      };

      // Track human activity separately (non-SYSTEM)
      if (type !== 'SYSTEM') {
        updateData.lastHumanActivityAt = now;
      }

      if (shouldAutoContact) {
        updateData.status = 'CONTACTED' as LeadStatus;
      }

      await tx.lead.update({
        where: { id },
        data: updateData,
      });

      // If status changed, create status history entry
      if (shouldAutoContact) {
        await tx.leadStatusHistory.create({
          data: {
            leadId: id,
            fromStatus: LeadStatus.NEW,
            toStatus: LeadStatus.CONTACTED,
            reason: 'Automatically changed to CONTACTED on first human activity',
            changedById: adminUser.id,
          },
        });
      }

      return activity;
    });

    return NextResponse.json({ 
      activity: result,
      statusChanged: shouldAutoContact,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating activity:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
