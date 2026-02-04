import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "gobii_admin_session";

function getBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function isAuthorized(req: NextRequest): boolean {
  const adminToken = process.env.APP_ADMIN_TOKEN?.trim() || "";
  if (!adminToken) return false;

  // 1) Bearer (scripts)
  const bearer = getBearer(req);
  if (bearer && bearer === adminToken) return true;

  // 2) Cookie (browser/UI + sessões)
  const c = req.cookies.get(COOKIE_NAME)?.value;
  if (c) return true;

  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // permitir login/logout sem bloqueio (evita loops)
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (pathname === "/api/health") return NextResponse.next();

  // só protegemos admin + api admin via matcher
  if (isAuthorized(req)) return NextResponse.next();

  // API -> 401 JSON
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  // UI -> redirect para login com next
  const nextUrl = encodeURIComponent(pathname + (search || ""));
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${nextUrl}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};