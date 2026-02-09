/**
 * Shared parser for SYSTEM activity meta embedded in notes.
 *
 * The ingest endpoint formats meta as:
 * ```
 * ---
 * Agent: SAP_S4HANA_RFPScanner_Daily
 * Category: RFP
 * Confidence: HIGH
 * Source: https://…
 * Detected: 2026-02-09
 * ```
 *
 * This module is reused by:
 * - deriveCommercialSignal (backend signal classification)
 * - Lead detail page (frontend SYSTEM meta rendering)
 * - Backfill endpoint (deduplication checks)
 *
 * @module lib/crm/parseSystemMeta
 */

export interface ParsedSystemMeta {
  agent: string | null;
  category: string | null;
  confidence: string | null;
  sourceUrl: string | null;
  detectedAt: string | null;
}

/**
 * Parse meta fields embedded in the notes of a SYSTEM activity.
 */
export function parseSystemMeta(notes: string | null): ParsedSystemMeta {
  const meta: ParsedSystemMeta = {
    agent: null,
    category: null,
    confidence: null,
    sourceUrl: null,
    detectedAt: null,
  };

  if (!notes) return meta;

  const lines = notes.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Agent:")) {
      meta.agent = trimmed.slice("Agent:".length).trim() || null;
    } else if (trimmed.startsWith("Category:")) {
      meta.category = trimmed.slice("Category:".length).trim().toUpperCase() || null;
    } else if (trimmed.startsWith("Confidence:")) {
      meta.confidence = trimmed.slice("Confidence:".length).trim().toUpperCase() || null;
    } else if (trimmed.startsWith("Source:")) {
      meta.sourceUrl = trimmed.slice("Source:".length).trim() || null;
    } else if (trimmed.startsWith("Detected:")) {
      meta.detectedAt = trimmed.slice("Detected:".length).trim() || null;
    }
  }

  return meta;
}

/**
 * Sanitize a source URL: only allow http:// or https:// URLs.
 * Returns null for anything else.
 */
export function sanitizeSourceUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return null;
}
