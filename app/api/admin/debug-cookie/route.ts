import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "gobii_admin_session";

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieApi = req.cookies.get(COOKIE_NAME)?.value || "";
  const ua = req.headers.get("user-agent") || "";
  const host = req.headers.get("host") || "";
  const referer = req.headers.get("referer") || "";
  const xff = req.headers.get("x-forwarded-for") || "";
  const xfp = req.headers.get("x-forwarded-proto") || "";

  return NextResponse.json({
    ok: true,
    host,
    ua,
    referer,
    x_forwarded_for: xff,
    x_forwarded_proto: xfp,
    cookie_header_raw: cookieHeader,
    cookie_api_value: cookieApi,
    cookie_header_has_session: cookieHeader.includes(`${COOKIE_NAME}=`),
    cookie_api_has_session: !!cookieApi,
  });
}