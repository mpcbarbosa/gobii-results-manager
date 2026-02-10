import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/leads/[id]/tasks
 *
 * Returns open (uncompleted) TASK activities for a lead,
 * ordered by dueAt ascending.
 */
export async function GET(
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

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const tasks = await prisma.activity.findMany({
      where: {
        leadId: id,
        type: "TASK",
        completedAt: null,
      },
      orderBy: { dueAt: "asc" },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
        isOverdue: t.dueAt ? new Date(t.dueAt) < new Date() : false,
      })),
    });
  } catch (error) {
    console.error("[tasks] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
