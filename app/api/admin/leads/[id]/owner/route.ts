import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * PATCH /api/admin/leads/[id]/owner
 *
 * Assign or change the owner of a lead.
 * Creates a SYSTEM activity for audit trail.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { ownerId } = body as { ownerId?: string | null };

    // Validate lead exists
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // If setting an owner, validate user exists
    let ownerName = "Unassigned";
    if (ownerId) {
      const user = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, name: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 400 },
        );
      }
      ownerName = user.name;
    }

    // Get system user for audit activity
    let systemUser = await prisma.user.findFirst({
      where: { email: "system@gobii.internal" },
    });

    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: {
          email: "system@gobii.internal",
          name: "Gobii System",
          role: "ADMIN",
          isActive: true,
        },
      });
    }

    // Update lead and create audit activity
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updatedLead = await tx.lead.update({
          where: { id },
          data: { ownerId: ownerId || null },
          include: {
            account: { select: { name: true } },
            ownerUser: { select: { id: true, name: true, email: true } },
          },
        });

        // Create audit activity
        await tx.activity.create({
          data: {
            leadId: id,
            type: "SYSTEM",
            title: "Lead assigned",
            notes: ownerId
              ? `Assigned to ${ownerName}`
              : "Owner removed (unassigned)",
            createdById: systemUser!.id,
          },
        });

        // Create audit trail entry
        await tx.leadChange.create({
          data: {
            leadId: id,
            field: "ownerId",
            fromValue: lead.ownerId ?? null,
            toValue: ownerId ?? null,
          },
        });

        return updatedLead;
      },
    );

    return NextResponse.json({
      success: true,
      lead: {
        id: result.id,
        ownerId: result.ownerId,
        owner: result.ownerUser
          ? {
              id: result.ownerUser.id,
              name: result.ownerUser.name,
              email: result.ownerUser.email,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[assign-owner] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
