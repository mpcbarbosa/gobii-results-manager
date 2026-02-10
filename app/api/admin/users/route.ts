import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/users
 *
 * Returns active users for owner assignment dropdowns.
 */
export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ items: users });
  } catch (error) {
    console.error("[users] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
