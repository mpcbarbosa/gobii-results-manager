import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "gobii_admin_session";

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

  const session = req.cookies.get(COOKIE_NAME)?.value;

  if (!session) {
    // API should return 401, pages should redirect
    if (isAdminApi) {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }
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
