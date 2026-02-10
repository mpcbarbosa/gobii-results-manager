import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * PATCH /api/admin/leads/[id]/tasks/complete
 *
 * Mark a task as completed.
 * Body: { taskId: string }
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
    const { id: leadId } = await params;
    const body = await request.json();
    const { taskId } = body as { taskId?: string };

    if (!taskId) {
      return NextResponse.json(
        { error: "Missing taskId" },
        { status: 400 },
      );
    }

    // Verify task exists and belongs to lead
    const task = await prisma.activity.findFirst({
      where: {
        id: taskId,
        leadId,
        type: "TASK",
        completedAt: null,
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found or already completed" },
        { status: 404 },
      );
    }

    // Get system user
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

    // Mark task as completed and create audit activity
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.activity.update({
        where: { id: taskId },
        data: { completedAt: new Date() },
      });

      await tx.activity.create({
        data: {
          leadId,
          type: "SYSTEM",
          title: "Task completed",
          notes: `Completed task: ${task.title}`,
          createdById: systemUser!.id,
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data: {
          lastActivityAt: new Date(),
          lastHumanActivityAt: new Date(),
        },
      });
    });

    return NextResponse.json({ success: true, taskId });
  } catch (error) {
    console.error("[complete-task] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
