type AuthOk = { ok: true };
type AuthErr = { ok: false; status: number; error: string };

const COOKIE_NAME = "gobii_admin_session";

function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;

  // "a=1; b=2"
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function getBearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function requireAdminAuth(req: Request): AuthOk | AuthErr {
  const adminToken = process.env.APP_ADMIN_TOKEN?.trim();
  if (!adminToken) return { ok: false, status: 500, error: "server_misconfigured" };

  // 1) Bearer token (scripts)
  const bearer = getBearerToken(req);
  if (bearer && bearer === adminToken) return { ok: true };

  // 2) Cookie session (browser/UI)
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  if (cookies[COOKIE_NAME]) return { ok: true };

  return { ok: false, status: 401, error: "unauthorized" };
}
