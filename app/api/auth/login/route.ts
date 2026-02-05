import { NextResponse } from "next/server";
const COOKIE_NAME = "gobii_admin_session";

type LoginBody = {
  token?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as LoginBody;
    const token = typeof body.token === "string" ? body.token.trim() : "";

    const adminToken = process.env.APP_ADMIN_TOKEN?.trim();
    if (!adminToken) {
      return NextResponse.json(
        { success: false, error: "server_misconfigured", message: "APP_ADMIN_TOKEN not configured" },
        { status: 500 }
      );
    }

    if (!token || token !== adminToken) {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });

    // session cookie (presence-based). IMPORTANT: no sameSite to maximize client compatibility (e.g., PowerShell 5.1)
    res.cookies.set({
      name: COOKIE_NAME,
      value: "1",
      httpOnly: true,
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { success: false, error: "internal_error", message },
      { status: 500 }
    );
  }
}
