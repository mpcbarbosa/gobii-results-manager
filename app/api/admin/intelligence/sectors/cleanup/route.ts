import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recordIngestAudit } from "@/lib/crm/auditIngest";

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/** Direct mojibake string replacement map (literal UTF-8 double-encoded sequences) */
const MOJIBAKE_MAP: Record<string, string> = {
  "\u00C3\u00A1": "\u00E1", // á
  "\u00C3\u00A2": "\u00E2", // â
  "\u00C3\u00A3": "\u00E3", // ã
  "\u00C3\u00A4": "\u00E4", // ä
  "\u00C3\u00A7": "\u00E7", // ç
  "\u00C3\u00A9": "\u00E9", // é
  "\u00C3\u00AA": "\u00EA", // ê
  "\u00C3\u00AD": "\u00ED", // í
  "\u00C3\u00B3": "\u00F3", // ó
  "\u00C3\u00B4": "\u00F4", // ô
  "\u00C3\u00BA": "\u00FA", // ú
  "\u00C3\u00A0": "\u00E0", // à
  "\u00C3\u0089": "\u00C9", // É
  "\u00C3\u0093": "\u00D3", // Ó
  "\u00C3\u009A": "\u00DA", // Ú
  "\u00C2": "",              // stray Â
  "\u00EF\u00BF\u00BD": "\u00FA", // ï¿½ → ú (most common case)
};

function repairMojibake(s: string): string {
  // Sort by length descending to match longer sequences first
  const entries = Object.entries(MOJIBAKE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [bad, good] of entries) {
    s = s.split(bad).join(good);
  }
  // Remove replacement character
  s = s.replace(/\uFFFD/g, "");
  return s;
}

function canonicalizeSector(raw: string): string {
  let s = raw.trim();

  // 1. Direct mojibake repair
  s = repairMojibake(s);

  // 2. NFC normalize
  try {
    s = s.normalize("NFC");
  } catch {
    // ignore
  }

  // 3. Collapse spaces
  s = s.replace(/\s+/g, " ").trim();

  return s;
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

/**
 * POST /api/admin/intelligence/sectors/cleanup
 *
 * Deduplicate and fix encoding in SectorIntelligence records.
 * Idempotent: running twice produces no changes on second run.
 */
export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // 1. Read all sectors
    const allSectors = await prisma.sectorIntelligence.findMany({
      orderBy: { detectedAt: "desc" },
    });

    // 2. Group by canonical name
    const groups = new Map<
      string,
      typeof allSectors
    >();

    for (const sector of allSectors) {
      const canonical = canonicalizeSector(sector.sector);
      const key = canonical.toLowerCase();
      const existing = groups.get(key) ?? [];
      existing.push(sector);
      groups.set(key, existing);
    }

    // 3. Process each group
    const items: CleanupItem[] = [];
    let renamed = 0;
    let merged = 0;
    let deleted = 0;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const [, members] of groups) {
        if (members.length === 0) continue;

        // Sort: most recent detectedAt first, then createdAt
        members.sort((a, b) => {
          const dDiff = b.detectedAt.getTime() - a.detectedAt.getTime();
          if (dDiff !== 0) return dDiff;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });

        const winner = members[0];
        const canonical = canonicalizeSector(winner.sector);
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

        // Check if rename needed
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
            items.push({ from: winner.sector, to: canonical, action: "renamed", reason: "Encoding fixed" });
            renamed++;
          }
          if (needsFill) {
            items.push({ from: winner.sector, to: canonical, action: "merged", reason: `Filled ${Object.keys(fillData).join(", ")} from duplicates` });
            merged++;
          }
        } else if (losers.length === 0) {
          items.push({ from: winner.sector, to: canonical, action: "kept", reason: "Already clean" });
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

    // Audit
    await recordIngestAudit({
      agent: "admin_sector_cleanup",
      endpoint: "/api/admin/intelligence/sectors/cleanup",
      status: "SUCCESS",
      processed: allSectors.length,
      created: 0,
      updated: renamed + merged,
      skipped: 0,
      meta: {
        groups: groups.size,
        renamed,
        merged,
        deleted,
        sampleActions: items.slice(0, 5),
      },
    });

    return NextResponse.json({
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
