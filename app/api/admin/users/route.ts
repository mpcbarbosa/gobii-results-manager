import { NextRequest, NextResponse } from "next/server";
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

/**
 * POST /api/admin/users
 *
 * Create a new user (admin-only).
 */
export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  try {
    const body = await request.json();
    const { name, email, role } = body as {
      name?: string;
      email?: string;
      role?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check uniqueness
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 },
      );
    }

    // Validate role (use existing UserRole enum)
    const validRoles = ["ADMIN", "OPERATIONS_LEAD", "OPERATOR", "VIEWER"];
    const userRole = role && validRoles.includes(role) ? role : "ADMIN";

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        role: userRole as "ADMIN" | "OPERATIONS_LEAD" | "OPERATOR" | "VIEWER",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, item: user }, { status: 201 });
  } catch (error) {
    console.error("[create-user] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
