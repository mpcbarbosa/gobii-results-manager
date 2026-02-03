import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "gobii_admin_session";

function getBearerToken(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminUi = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  // só proteger estas áreas
  if (!isAdminUi && !isAdminApi) return NextResponse.next();

  // permitir a página /admin/login sem auth
  if (pathname === "/admin/login") return NextResponse.next();

  const adminToken = (process.env.APP_ADMIN_TOKEN || "").trim();

  // 1) bearer (scripts/automação)
  const bearer = getBearerToken(req);
  const bearerOk = adminToken && bearer && bearer === adminToken;

  // 2) cookie session (browser/UI)
  const cookieOk = Boolean(req.cookies.get(COOKIE_NAME)?.value);

  if (bearerOk || cookieOk) return NextResponse.next();

  // UI -> redirect para login
  if (isAdminUi) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // API -> 401 JSON
  return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};