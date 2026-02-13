import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeAgentPayload } from "@/lib/crm/normalizeAgentPayload";
import { normalizeUnicodeNFC, resolveField } from "@/lib/crm/normalizeText";
import { recordIngestAudit } from "@/lib/crm/auditIngest";

/**
 * POST /api/ingest/sectors
 *
 * Ingest sector intelligence data from SectorInvestmentScanner agent.
 * Uses upsert: if sector already exists, updates it; otherwise creates.
 *
 * Auth: APP_INGEST_TOKEN (same as activity ingest)
 *
 * Payload:
 * {
 *   "sectors": [
 *     {
 *       "sector": "Indústria Farmacêutica",
 *       "growth": "high",
 *       "investmentIntensity": "high",
 *       "maturity": "mature",
 *       "erpProbability": "HIGH",
 *       "source": "https://...",
 *       "detected_at": "2026-02-13"
 *     }
 *   ],
 *   "meta": {
 *     "agent": "SAP_S4HANA_SectorInvestmentScanner_Daily",
 *     "confidence": "Alta"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.APP_INGEST_TOKEN;

    if (!expectedToken) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7).trim();
    if (token !== expectedToken) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    // 2. Parse and validate payload
    const body = await request.json();

    if (!body.sectors || !Array.isArray(body.sectors)) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid 'sectors' array" },
        { status: 400 },
      );
    }

    // Normalize agent meta
    const normalizedMeta = normalizeAgentPayload(body.meta);

    // 3. Process each sector
    const results: Array<{
      sector: string;
      action: "created" | "updated" | "skipped";
      reason: string;
    }> = [];

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of body.sectors) {
      // Resolve PT/EN field variants
      const rawSector = resolveField(item, "sector", "setor") as string | undefined;

      if (!rawSector || typeof rawSector !== "string") {
        results.push({
          sector: String(rawSector ?? "unknown"),
          action: "skipped",
          reason: "Missing or invalid 'sector'/'setor' field",
        });
        skipped++;
        continue;
      }

      const sectorName = normalizeUnicodeNFC(rawSector);
      if (!sectorName) {
        results.push({
          sector: "empty",
          action: "skipped",
          reason: "Empty sector name",
        });
        skipped++;
        continue;
      }

      // Resolve PT/EN field variants for other fields
      const erpRaw = resolveField(item, "erpProbability", "erp_probability", "probabilidade_ERP", "probabilidadeERP") as string | undefined ?? normalizedMeta.confidence;
      const erpNormalized = normalizeErpProbability(erpRaw);
      const sourceRaw = resolveField(item, "source", "fonte_principal", "fonte") as string | undefined;
      const detectedAtRaw = resolveField(item, "detected_at", "detectedAt") as string | undefined;

      const detectedAt = detectedAtRaw
        ? new Date(detectedAtRaw)
        : new Date(normalizedMeta.detected_at);

      // Validate date
      if (isNaN(detectedAt.getTime())) {
        results.push({
          sector: sectorName,
          action: "skipped",
          reason: "Invalid detected_at date",
        });
        skipped++;
        continue;
      }

      try {
        // Upsert: create or update by sector name
        const existing = await prisma.sectorIntelligence.findUnique({
          where: { sector: sectorName },
        });

        if (existing) {
          // Only update if new data is more recent
          if (detectedAt >= existing.detectedAt) {
            await prisma.sectorIntelligence.update({
              where: { sector: sectorName },
              data: {
                growth: item.growth ?? existing.growth,
                investmentIntensity:
                  item.investmentIntensity ??
                  item.investment_intensity ??
                  existing.investmentIntensity,
                maturity: item.maturity ?? existing.maturity,
                erpProbability: erpNormalized,
                source: sourceRaw ?? existing.source,
                detectedAt,
              },
            });
            results.push({
              sector: sectorName,
              action: "updated",
              reason: "Updated with newer data",
            });
            updated++;
          } else {
            results.push({
              sector: sectorName,
              action: "skipped",
              reason: "Existing data is more recent",
            });
            skipped++;
          }
        } else {
          await prisma.sectorIntelligence.create({
            data: {
              sector: sectorName,
              growth: item.growth ?? null,
              investmentIntensity:
                item.investmentIntensity ??
                item.investment_intensity ??
                null,
              maturity: item.maturity ?? null,
              erpProbability: erpNormalized,
              source: sourceRaw ?? null,
              detectedAt,
            },
          });
          results.push({
            sector: sectorName,
            action: "created",
            reason: "New sector created",
          });
          created++;
        }
      } catch (err) {
        results.push({
          sector: sectorName,
          action: "skipped",
          reason: `Error: ${err instanceof Error ? err.message : "unknown"}`,
        });
        skipped++;
      }
    }

    // Record audit
    await recordIngestAudit({
      agent: normalizedMeta.agent,
      endpoint: "/api/ingest/sectors",
      status: created + updated > 0 ? "SUCCESS" : skipped > 0 ? "SKIPPED" : "SUCCESS",
      processed: body.sectors.length,
      created,
      updated,
      skipped,
      meta: { itemsFirst3: results.slice(0, 3) },
    });

    return NextResponse.json({
      success: true,
      agent: normalizedMeta.agent,
      processed: body.sectors.length,
      created,
      updated,
      skipped,
      items: results,
    });
  } catch (error) {
    console.error("[ingest/sectors] Error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeErpProbability(raw: string | undefined | null): string {
  if (!raw) return "LOW";
  const lower = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    alta: "HIGH",
    alto: "HIGH",
    high: "HIGH",
    média: "MEDIUM",
    medio: "MEDIUM",
    médio: "MEDIUM",
    medium: "MEDIUM",
    baixa: "LOW",
    baixo: "LOW",
    low: "LOW",
  };
  return map[lower] ?? "LOW";
}
