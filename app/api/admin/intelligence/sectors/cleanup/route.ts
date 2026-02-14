import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recordIngestAudit } from "@/lib/crm/auditIngest";
import { jsonUtf8 } from "@/lib/http/jsonUtf8";

// ---------------------------------------------------------------------------
// Mojibake detection & repair
// ---------------------------------------------------------------------------

const MOJIBAKE_REGEX = /[\u00C3\u00C2]|ï¿|�/;

/** Count mojibake markers in a string */
function mojibakeScore(s: string): number {
  let score = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x00C3 || c === 0x00C2) score++;
    if (c === 0xFFFD) score++;
  }
  if (s.includes("ï¿")) score += s.split("ï¿").length - 1;
  return score;
}

/** Attempt A: treat string bytes as Latin-1 and decode as UTF-8 */
function attemptLatin1ToUtf8(s: string): string {
  try {
    return Buffer.from(s, "latin1").toString("utf8");
  } catch {
    return s;
  }
}

/** Attempt B: direct replacement map */
const REPLACEMENT_MAP: [string, string][] = [
  ["\u00C3\u00A1", "\u00E1"], // á
  ["\u00C3\u00A2", "\u00E2"], // â
  ["\u00C3\u00A3", "\u00E3"], // ã
  ["\u00C3\u00A4", "\u00E4"], // ä
  ["\u00C3\u00A7", "\u00E7"], // ç
  ["\u00C3\u00A9", "\u00E9"], // é
  ["\u00C3\u00AA", "\u00EA"], // ê
  ["\u00C3\u00AD", "\u00ED"], // í
  ["\u00C3\u00B3", "\u00F3"], // ó
  ["\u00C3\u00B4", "\u00F4"], // ô
  ["\u00C3\u00BA", "\u00FA"], // ú
  ["\u00C3\u00A0", "\u00E0"], // à
  ["\u00C3\u0089", "\u00C9"], // É
  ["\u00C3\u0093", "\u00D3"], // Ó
  ["\u00C3\u009A", "\u00DA"], // Ú
];

function attemptReplacementMap(s: string): string {
  let result = s;
  for (const [bad, good] of REPLACEMENT_MAP) {
    result = result.split(bad).join(good);
  }
  // Remove stray Â
  result = result.replace(/\u00C2/g, "");
  // Remove replacement character
  result = result.replace(/\uFFFD/g, "");
  // Remove ï¿½ sequence
  result = result.replace(/ï¿½/g, "");
  return result;
}

interface CanonicalResult {
  canonical: string;
  steps: string[];
}

function canonicalizeSector(raw: string): CanonicalResult {
  const steps: string[] = [];

  // Base: trim + collapse spaces + NFC
  let base = raw.trim().replace(/\s+/g, " ");
  try { base = base.normalize("NFC"); } catch { /* ignore */ }

  // Check if mojibake present
  if (!MOJIBAKE_REGEX.test(base)) {
    return { canonical: base, steps: ["clean"] };
  }

  steps.push("mojibake detected");

  // Attempt A: latin1 -> utf8
  const attemptA = attemptLatin1ToUtf8(base);
  const scoreA = mojibakeScore(attemptA);

  // Attempt B: replacement map
  const attemptB = attemptReplacementMap(base);
  const scoreB = mojibakeScore(attemptB);

  let chosen: string;
  if (scoreA <= scoreB && scoreA === 0) {
    chosen = attemptA;
    steps.push("latin1->utf8 repair");
  } else if (scoreB <= scoreA && scoreB === 0) {
    chosen = attemptB;
    steps.push("replacement map repair");
  } else if (scoreA < scoreB) {
    chosen = attemptA;
    steps.push(`latin1->utf8 (score ${scoreA} vs ${scoreB})`);
  } else if (scoreB < scoreA) {
    chosen = attemptB;
    steps.push(`replacement map (score ${scoreB} vs ${scoreA})`);
  } else {
    // Equal scores — pick shorter
    chosen = attemptA.length <= attemptB.length ? attemptA : attemptB;
    steps.push("best of both");
  }

  // Final cleanup
  chosen = chosen.replace(/\uFFFD/g, "").replace(/ï¿½/g, "").trim().replace(/\s+/g, " ");
  try { chosen = chosen.normalize("NFC"); } catch { /* ignore */ }

  return { canonical: chosen, steps };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface CleanupItem {
  from: string;
  to: string;
  action: "renamed" | "merged" | "deleted" | "kept";
  reason: string;
}

export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const allSectors = await prisma.sectorIntelligence.findMany({
      orderBy: { detectedAt: "desc" },
    });

    // Group by canonical name (case-insensitive)
    const groups = new Map<string, Array<typeof allSectors[number]>>();

    for (const sector of allSectors) {
      const { canonical } = canonicalizeSector(sector.sector);
      const key = canonical.toLowerCase();
      const existing = groups.get(key) ?? [];
      existing.push(sector);
      groups.set(key, existing);
    }

    const items: CleanupItem[] = [];
    let renamed = 0;
    let merged = 0;
    let deleted = 0;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const [, members] of groups) {
        if (members.length === 0) continue;

        // Sort: most recent detectedAt first
        members.sort((a, b) => {
          const dDiff = b.detectedAt.getTime() - a.detectedAt.getTime();
          if (dDiff !== 0) return dDiff;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });

        const winner = members[0];
        const { canonical, steps } = canonicalizeSector(winner.sector);
        const losers = members.slice(1);

        // Fill missing fields from losers
        const fillData: Record<string, string | null> = {};
        for (const loser of losers) {
          if (!winner.growth && loser.growth && !fillData.growth) fillData.growth = loser.growth;
          if (!winner.investmentIntensity && loser.investmentIntensity && !fillData.investmentIntensity) fillData.investmentIntensity = loser.investmentIntensity;
          if (!winner.maturity && loser.maturity && !fillData.maturity) fillData.maturity = loser.maturity;
          if (!winner.erpProbability && loser.erpProbability && !fillData.erpProbability) fillData.erpProbability = loser.erpProbability;
          if (!winner.source && loser.source && !fillData.source) fillData.source = loser.source;
        }

        const needsRename = winner.sector !== canonical;
        const needsFill = Object.keys(fillData).length > 0;

        if (needsRename || needsFill) {
          await tx.sectorIntelligence.update({
            where: { id: winner.id },
            data: {
              sector: canonical,
              ...(fillData.growth ? { growth: fillData.growth } : {}),
              ...(fillData.investmentIntensity ? { investmentIntensity: fillData.investmentIntensity } : {}),
              ...(fillData.maturity ? { maturity: fillData.maturity } : {}),
              ...(fillData.erpProbability ? { erpProbability: fillData.erpProbability } : {}),
              ...(fillData.source ? { source: fillData.source } : {}),
            },
          });

          if (needsRename) {
            items.push({ from: winner.sector, to: canonical, action: "renamed", reason: steps.join(" > ") });
            renamed++;
          }
          if (needsFill) {
            items.push({ from: winner.sector, to: canonical, action: "merged", reason: `Filled: ${Object.keys(fillData).join(", ")}` });
            merged++;
          }
        } else if (losers.length === 0) {
          items.push({ from: winner.sector, to: canonical, action: "kept", reason: steps.join(" > ") });
        }

        // Delete losers
        if (losers.length > 0) {
          const loserIds = losers.map((l) => l.id);
          await tx.sectorIntelligence.deleteMany({
            where: { id: { in: loserIds } },
          });
          for (const loser of losers) {
            items.push({ from: loser.sector, to: canonical, action: "deleted", reason: "Duplicate removed" });
            deleted++;
          }
        }
      }
    });

    await recordIngestAudit({
      agent: "admin_sector_cleanup",
      endpoint: "/api/admin/intelligence/sectors/cleanup",
      status: "SUCCESS",
      processed: allSectors.length,
      updated: renamed + merged,
      meta: { groups: groups.size, renamed, merged, deleted, sampleActions: items.slice(0, 5) },
    });

    return jsonUtf8({
      success: true,
      scanned: allSectors.length,
      groups: groups.size,
      renamed,
      merged,
      deleted,
      items,
    });
  } catch (error) {
    console.error("[sector-cleanup] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
