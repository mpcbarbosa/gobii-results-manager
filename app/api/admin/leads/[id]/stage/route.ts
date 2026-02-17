import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { LeadStage } from "@prisma/client";

const VALID_STAGES: LeadStage[] = ["NEW", "ASSUMED", "QUALIFIED", "CONTACTED", "DISCARDED"];

/**
 * PATCH /api/admin/leads/[id]/stage
 *
 * Update the commercial pipeline stage of a lead.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { stage, reason } = body as { stage?: string; reason?: string };

    if (!stage || !VALID_STAGES.includes(stage as LeadStage)) {
      return NextResponse.json(
        { error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` },
        { status: 400 },
      );
    }

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      stage: stage as LeadStage,
    };

    if (stage === "ASSUMED") {
      // Set owner to system user if no ownerId exists
      if (!lead.ownerId) {
        const systemUser = await prisma.user.findFirst({ where: { email: "system@gobii.internal" } });
        if (systemUser) updateData.ownerId = systemUser.id;
      }
      updateData.ownerAssignedAt = now;
    }

    if (stage === "DISCARDED") {
      updateData.discardedAt = now;
      if (reason) updateData.discardReason = reason;
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        account: { select: { name: true, domain: true } },
        ownerUser: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      lead: {
        id: updated.id,
        stage: updated.stage,
        ownerId: updated.ownerId,
        ownerName: updated.ownerUser?.name ?? null,
        ownerAssignedAt: updated.ownerAssignedAt,
        discardedAt: updated.discardedAt,
        discardReason: updated.discardReason,
      },
    });
  } catch (error) {
    console.error("[stage] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
