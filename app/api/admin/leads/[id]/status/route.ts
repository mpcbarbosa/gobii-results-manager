import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import prisma from '@/lib/prisma';
import { LeadStatus, Prisma } from '@prisma/client';

// Only WON and LOST are truly terminal; DISCARDED can be reopened
const TERMINAL_STATUSES: LeadStatus[] = ['WON' as LeadStatus, 'LOST' as LeadStatus];

// PATCH /api/admin/leads/[id]/status - Update lead status
export async function PATCH(
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
    const { status, reason } = body;

    if (!status) {
      return NextResponse.json(
        { error: 'Missing required field: status' },
        { status: 400 }
      );
    }

    // Validate status value
    if (!Object.values(LeadStatus).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${Object.values(LeadStatus).join(', ')}` },
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

    // Check if current status is terminal
    if (TERMINAL_STATUSES.includes(lead.status)) {
      return NextResponse.json(
        { error: `Cannot change status from ${lead.status}. Terminal statuses (WON, LOST, DISCARDED) cannot be changed.` },
        { status: 400 }
      );
    }

    // Get the first admin user
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'No admin user found in system' },
        { status: 500 }
      );
    }

    // Update lead status and create history entry in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update lead status and lastActivityAt
      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          status,
          statusReason: reason || null,
          lastActivityAt: new Date(),
        },
        include: {
          account: true,
          source: true,
        },
      });

      // Create status history entry
      await tx.leadStatusHistory.create({
        data: {
          leadId: id,
          fromStatus: lead.status,
          toStatus: status,
          reason: reason || null,
          changedById: adminUser.id,
        },
      });

      // Create audit trail entry
      await tx.leadChange.create({
        data: {
          leadId: id,
          field: "status",
          fromValue: lead.status,
          toValue: status,
          reason: reason || null,
          changedByUserId: adminUser.id,
        },
      });

      return updatedLead;
    });

    return NextResponse.json({ lead: result });
  } catch (error) {
    console.error('Error updating lead status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
