/**
 * Text normalization helpers for robust ingest.
 * @module lib/crm/normalizeText
 */

/** Safe trim with null handling */
export function safeTrim(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim();
}

/** Normalize Unicode to NFC form and repair common mojibake */
export function normalizeUnicodeNFC(value: string | null | undefined): string {
  if (!value) return "";
  try {
    let s = value.trim();
    // Attempt to repair common Latin-1 → UTF-8 mojibake patterns
    s = repairMojibake(s);
    return s.normalize("NFC");
  } catch {
    return value.trim();
  }
}

/** Repair common mojibake patterns (Latin-1 bytes misinterpreted as UTF-8) */
function repairMojibake(s: string): string {
  // Common PT-PT mojibake patterns
  const replacements: [string, string][] = [
    ["\u00C3\u00BA", "\u00FA"],   // ú (Ãº → ú)
    ["\u00C3\u00AA", "\u00EA"],   // ê (Ãª → ê)
    ["\u00C3\u00A9", "\u00E9"],   // é (Ã© → é)
    ["\u00C3\u00A3", "\u00E3"],   // ã (Ã£ → ã)
    ["\u00C3\u00B3", "\u00F3"],   // ó (Ã³ → ó)
    ["\u00C3\u00AD", "\u00ED"],   // í (Ã­ → í)
    ["\u00C3\u00A1", "\u00E1"],   // á (Ã¡ → á)
    ["\u00C3\u00A7", "\u00E7"],   // ç (Ã§ → ç)
    ["\u00C3\u0089", "\u00C9"],   // É (Ã‰ → É)
    ["\u00C3\u0093", "\u00D3"],   // Ó (Ã" → Ó)
  ];
  let result = s;
  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }
  // Also handle replacement character
  result = result.replace(/\uFFFD/g, "");
  return result;
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
