/**
 * Agent Payload Normalizer
 *
 * Converts raw agent payloads into a unified internal structure.
 * Ensures consistent meta.category, meta.confidence, meta.agent, meta.detected_at.
 *
 * @module lib/crm/normalizeAgentPayload
 */

// ---------------------------------------------------------------------------
// Category mapping (strict — no free-form categories)
// ---------------------------------------------------------------------------

const AGENT_CATEGORY_MAP: Record<string, string> = {
  rfpscanner: "RFP",
  expansionscanner: "EXPANSION",
  clevelscanner: "CLEVEL",
  sectorinvestmentscanner: "SECTOR",
  erp_replacement: "ERP_REPLACEMENT",
};

/**
 * Derive category from agent name.
 * Falls back to explicit meta.category if agent name doesn't match.
 */
function deriveCategory(
  agent: string | undefined,
  explicitCategory: string | undefined,
): string {
  if (agent) {
    const lower = agent.toLowerCase();
    for (const [key, cat] of Object.entries(AGENT_CATEGORY_MAP)) {
      if (lower.includes(key)) return cat;
    }
  }
  if (explicitCategory) {
    const upper = explicitCategory.toUpperCase().trim();
    const allowed = new Set([
      "RFP",
      "EXPANSION",
      "CLEVEL",
      "SECTOR",
      "ERP_REPLACEMENT",
      "ERP_SIGNAL",
      "C_LEVEL",
    ]);
    // Normalize C_LEVEL → CLEVEL
    if (upper === "C_LEVEL") return "CLEVEL";
    if (allowed.has(upper)) return upper;
  }
  return "ERP_SIGNAL";
}

// ---------------------------------------------------------------------------
// Confidence normalization
// ---------------------------------------------------------------------------

const CONFIDENCE_MAP: Record<string, string> = {
  alta: "HIGH",
  alto: "HIGH",
  "alta probabilidade": "HIGH",
  high: "HIGH",
  média: "MEDIUM",
  medio: "MEDIUM",
  médio: "MEDIUM",
  medium: "MEDIUM",
  baixa: "LOW",
  baixo: "LOW",
  low: "LOW",
};

function normalizeConfidence(raw: string | undefined): "HIGH" | "MEDIUM" | "LOW" {
  if (!raw) return "LOW";
  const lower = raw.toLowerCase().trim();
  return (CONFIDENCE_MAP[lower] as "HIGH" | "MEDIUM" | "LOW") ?? "LOW";
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface NormalizedMeta {
  agent: string;
  category: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source_url: string | null;
  detected_at: string;
}

export interface AgentPayloadMeta {
  agent?: string;
  category?: string;
  confidence?: string;
  source_url?: string;
  detected_at?: string;
}

/**
 * Normalize an agent's meta payload into a consistent internal structure.
 */
export function normalizeAgentPayload(meta: AgentPayloadMeta | undefined): NormalizedMeta {
  const agent = meta?.agent ?? "unknown";
  const category = deriveCategory(agent, meta?.category);
  const confidence = normalizeConfidence(meta?.confidence);
  const source_url = meta?.source_url?.trim() || null;
  const detected_at = meta?.detected_at ?? new Date().toISOString().split("T")[0];

  return {
    agent,
    category,
    confidence,
    source_url,
    detected_at,
  };
}
