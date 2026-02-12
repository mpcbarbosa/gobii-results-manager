import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * PATCH /api/admin/tasks/[taskId]/reschedule
 *
 * Reschedule a task's dueAt. Creates audit trail.
 * Body: { dueAt: ISO string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  try {
    const { taskId } = await params;
    const body = await request.json();
    const { dueAt } = body as { dueAt?: string | null };

    // Find the task
    const task = await prisma.activity.findFirst({
      where: { id: taskId, type: "TASK", completedAt: null },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found or already completed" },
        { status: 404 },
      );
    }

    const oldDueAt = task.dueAt?.toISOString() ?? "none";
    const newDueAt = dueAt ? new Date(dueAt) : null;

    // Validate date
    if (dueAt && isNaN(new Date(dueAt).getTime())) {
      return NextResponse.json(
        { error: "Invalid dueAt date" },
        { status: 400 },
      );
    }

    // Get system user for audit
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

    // Update task and create audit activity
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.activity.update({
        where: { id: taskId },
        data: { dueAt: newDueAt },
      });

      await tx.activity.create({
        data: {
          leadId: task.leadId,
          type: "SYSTEM",
          title: "Task rescheduled",
          notes: `Rescheduled task "${task.title}" (${taskId})\nOld due: ${oldDueAt}\nNew due: ${newDueAt?.toISOString() ?? "none"}`,
          createdById: systemUser!.id,
        },
      });
    });

    return NextResponse.json({
      success: true,
      taskId,
      dueAt: newDueAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[reschedule] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
