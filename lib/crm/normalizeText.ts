/**
 * Text normalization helpers for robust ingest.
 * @module lib/crm/normalizeText
 */

/** Safe trim with null handling */
export function safeTrim(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim();
}

/** Normalize Unicode to NFC form to prevent mojibake */
export function normalizeUnicodeNFC(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return value.normalize("NFC").trim();
  } catch {
    return value.trim();
  }
}

/** Resolve PT/EN field name variants from an object */
export function resolveField(
  obj: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}
