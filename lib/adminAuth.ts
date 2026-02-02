import { cookies, headers } from "next/headers";

const COOKIE_NAME = "gobii_admin_session";

function getBearerToken(): string {
  const h = headers();
  const auth = h.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function requireAdminAuth(): { ok: true } | { ok: false; status: number; error: string } {
  const adminToken = process.env.APP_ADMIN_TOKEN?.trim();
  if (!adminToken) {
    return { ok: false, status: 500, error: "server_misconfigured" };
  }

  // 1) Bearer (scripts)
  const bearer = getBearerToken();
  if (bearer && bearer === adminToken) return { ok: true };

  // 2) Cookie session (browser/UI)
  const c = cookies().get(COOKIE_NAME)?.value;
  if (c) return { ok: true };

  return { ok: false, status: 401, error: "unauthorized" };
}
