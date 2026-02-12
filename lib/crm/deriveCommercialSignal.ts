/**
 * Commercial Signal Derivation
 *
 * Analyses SYSTEM activities for a lead and classifies the commercial
 * signal level deterministically. No scoring is persisted — everything
 * is derived on-the-fly from existing Activity records.
 *
 * @module lib/crm/deriveCommercialSignal
 */

import { parseSystemMeta, sanitizeSourceUrl } from "./parseSystemMeta";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal Activity shape required by this helper (avoids coupling to Prisma) */
export interface ActivityInput {
  id: string;
  type: string; // "SYSTEM" | "NOTE" | …
  title: string;
  notes: string | null;
  createdAt: Date;
}

export type SignalLevel = "HIGH" | "MEDIUM" | "LOW";

export interface CommercialSignal {
  signalLevel: SignalLevel;
  reasons: string[];
  lastSignalAt: Date | null;
  lastSignalCategory: string | null;
  /** Agent name from the most recent SYSTEM activity that produced lastSignalAt */
  lastSignalAgent: string | null;
  /** Sanitized source URL (http/https only) from the most recent signal */
  lastSignalSourceUrl: string | null;
  /** Confidence level from the most recent signal */
  lastSignalConfidence: string | null;
}

// Re-export parseActivityMeta for backward compatibility
export { parseSystemMeta as parseActivityMeta } from "./parseSystemMeta";

// ---------------------------------------------------------------------------
// Signal classification rules
// ---------------------------------------------------------------------------

/** Categories that indicate HIGH commercial intent */
const HIGH_CATEGORIES = new Set(["RFP", "ERP_REPLACEMENT"]);

/** Categories that indicate MEDIUM commercial intent */
const MEDIUM_CATEGORIES = new Set(["EXPANSION", "C_LEVEL", "CLEVEL", "SECTOR"]);

/** Number of days to consider for the "recent activity burst" rule */
const RECENT_WINDOW_DAYS = 14;

/** Minimum SYSTEM activities within the recent window to trigger MEDIUM */
const RECENT_BURST_THRESHOLD = 2;

/**
 * Derive the commercial signal for a lead based on its SYSTEM activities.
 *
 * Rules (evaluated in priority order):
 *
 * **HIGH**
 *   - ≥1 SYSTEM activity with category ∈ {RFP, ERP_REPLACEMENT}
 *   - OR ≥1 SYSTEM activity with confidence === "HIGH"
 *
 * **MEDIUM**
 *   - ≥1 SYSTEM activity with category ∈ {EXPANSION, C_LEVEL}
 *   - OR ≥2 SYSTEM activities in the last 14 days
 *
 * **LOW**
 *   - Everything else
 */
export function deriveCommercialSignal(
  activities: ActivityInput[],
): CommercialSignal {
  // Filter to SYSTEM activities only
  const systemActivities = activities.filter((a) => a.type === "SYSTEM");

  // No SYSTEM activities → LOW with no signal
  if (systemActivities.length === 0) {
    return {
      signalLevel: "LOW",
      reasons: ["No system signals detected"],
      lastSignalAt: null,
      lastSignalCategory: null,
      lastSignalAgent: null,
      lastSignalSourceUrl: null,
      lastSignalConfidence: null,
    };
  }

  // Sort by createdAt descending (most recent first)
  const sorted = [...systemActivities].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Parse meta for each activity
  const parsed = sorted.map((a) => ({
    activity: a,
    meta: parseSystemMeta(a.notes),
  }));

  // Determine the most recent signal metadata
  const latestMeta = parsed[0].meta;
  const lastSignalAt = sorted[0].createdAt;
  const lastSignalCategory = latestMeta.category;
  const lastSignalAgent = latestMeta.agent;
  const lastSignalSourceUrl = sanitizeSourceUrl(latestMeta.sourceUrl);
  const lastSignalConfidence = latestMeta.confidence;

  // Collect reasons
  const reasons: string[] = [];
  let signalLevel: SignalLevel = "LOW";

  // --- HIGH checks ---
  const highCategoryHits = parsed.filter(
    (p) => p.meta.category && HIGH_CATEGORIES.has(p.meta.category),
  );
  const highConfidenceHits = parsed.filter(
    (p) => p.meta.confidence === "HIGH",
  );

  if (highCategoryHits.length > 0) {
    signalLevel = "HIGH";
    const categories = [
      ...new Set(highCategoryHits.map((h) => h.meta.category!)),
    ];
    for (const cat of categories) {
      reasons.push(`${cat} detected`);
    }
  }

  if (highConfidenceHits.length > 0) {
    signalLevel = "HIGH";
    if (!reasons.some((r) => r.includes("High confidence"))) {
      reasons.push(
        `High confidence signal from ${highConfidenceHits[0].meta.agent || "agent"}`,
      );
    }
  }

  // --- MEDIUM checks (only if not already HIGH) ---
  if (signalLevel !== "HIGH") {
    const mediumCategoryHits = parsed.filter(
      (p) => p.meta.category && MEDIUM_CATEGORIES.has(p.meta.category),
    );

    if (mediumCategoryHits.length > 0) {
      signalLevel = "MEDIUM";
      const categories = [
        ...new Set(mediumCategoryHits.map((h) => h.meta.category!)),
      ];
      for (const cat of categories) {
        if (cat === "EXPANSION") reasons.push("Recent expansion signal");
        else if (cat === "C_LEVEL" || cat === "CLEVEL") reasons.push("C-level change detected");
        else if (cat === "SECTOR") reasons.push("Sector investment signal");
        else reasons.push(`${cat} detected`);
      }
    }

    // Recent burst rule
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const recentCount = sorted.filter(
      (a) => new Date(a.createdAt).getTime() >= windowStart.getTime(),
    ).length;

    if (recentCount >= RECENT_BURST_THRESHOLD && signalLevel !== "MEDIUM") {
      signalLevel = "MEDIUM";
      reasons.push(
        `${recentCount} system signals in the last ${RECENT_WINDOW_DAYS} days`,
      );
    } else if (
      recentCount >= RECENT_BURST_THRESHOLD &&
      signalLevel === "MEDIUM"
    ) {
      reasons.push(
        `${recentCount} system signals in the last ${RECENT_WINDOW_DAYS} days`,
      );
    }
  }

  // --- LOW fallback ---
  if (signalLevel === "LOW") {
    reasons.push("No high-priority signals detected");
  }

  return {
    signalLevel,
    reasons,
    lastSignalAt,
    lastSignalCategory,
    lastSignalAgent,
    lastSignalSourceUrl,
    lastSignalConfidence,
  };
}
