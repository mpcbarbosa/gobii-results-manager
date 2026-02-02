import { NextResponse } from "next/server";

const COOKIE_NAME = "gobii_admin_session";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const token = (body?.token ?? "").toString().trim();

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

    // session cookie (simple: presence-based). For future: rotate to signed JWT.
    res.cookies.set({
      name: COOKIE_NAME,
      value: "1",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "internal_error", message: e?.message ?? "unknown" },
      { status: 500 }
    );
  }
}
