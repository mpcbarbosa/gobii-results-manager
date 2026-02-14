import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { jsonUtf8 } from "@/lib/http/jsonUtf8";

/**
 * GET /api/admin/agents/runs
 *
 * Returns agent ingest audit trail with filtering.
 */
export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const take = Math.min(parseInt(searchParams.get("take") ?? "200"), 500);
    const status = searchParams.get("status") || undefined;
    const endpoint = searchParams.get("endpoint") || undefined;
    const agent = searchParams.get("agent") || undefined;
    const window = searchParams.get("window") || undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (endpoint) where.endpoint = endpoint;
    if (agent) where.agent = { contains: agent, mode: "insensitive" };
    if (window) {
      const hours = window === "24h" ? 24 : window === "7d" ? 168 : window === "30d" ? 720 : 24;
      where.createdAt = { gte: new Date(Date.now() - hours * 3600000) };
    }

    const runs = await prisma.agentIngestAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    });

    // Summary for the filtered window
    const summary = { success: 0, skipped: 0, error: 0 };
    for (const r of runs) {
      if (r.status === "SUCCESS") summary.success++;
      else if (r.status === "SKIPPED") summary.skipped++;
      else if (r.status === "ERROR") summary.error++;
    }

    return jsonUtf8({
      success: true,
      count: runs.length,
      summary,
      items: runs,
    });
  } catch (error) {
    console.error("[agents/runs] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
