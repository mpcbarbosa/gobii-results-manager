import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/intelligence/sectors
 *
 * Returns sector intelligence data (macro-level, not tied to leads).
 */
export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const sectors = await prisma.sectorIntelligence.findMany({
      orderBy: { detectedAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      success: true,
      count: sectors.length,
      items: sectors,
    });
  } catch (error) {
    console.error("[sectors] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
