/**
 * JSON response helper with explicit UTF-8 charset.
 *
 * Ensures Content-Type: application/json; charset=utf-8 to prevent
 * mojibake in clients that default to Latin-1 (e.g., PowerShell 5.1).
 *
 * @module lib/http/jsonUtf8
 */

export function jsonUtf8(
  data: unknown,
  init?: ResponseInit,
): Response {
  const body = JSON.stringify(data);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(body, {
    ...init,
    headers,
  });
}
