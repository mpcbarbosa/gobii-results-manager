import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "gobii_admin_session";

function hasValidBearer(req: NextRequest): boolean {
  const adminToken = process.env.APP_ADMIN_TOKEN?.trim();
  if (!adminToken) return false;

  const auth = req.headers.get("authorization");
  if (!auth) return false;

  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token === adminToken;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  // allow login endpoints/pages
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/auth/login";
  const isLogoutApi = pathname === "/api/auth/logout";

  if (!(isAdminPage || isAdminApi)) return NextResponse.next();
  if (isLoginPage || isLoginApi || isLogoutApi) return NextResponse.next();

  // 1) API: allow either cookie OR valid Bearer APP_ADMIN_TOKEN (robusto p/ scripts)
  if (isAdminApi) {
    const session = req.cookies.get(COOKIE_NAME)?.value;
    if (session) return NextResponse.next();

    if (hasValidBearer(req)) return NextResponse.next();

    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  // 2) Pages: require cookie, otherwise redirect to /admin/login
  const session = req.cookies.get(COOKIE_NAME)?.value;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
