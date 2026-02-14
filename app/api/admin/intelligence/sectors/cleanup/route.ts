import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recordIngestAudit } from "@/lib/crm/auditIngest";

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/** Known manual fixes for irrecoverable mojibake */
const MANUAL_FIXES: Record<string, string> = {
  "ind\uFFFDstria transformadora": "Indústria transformadora",
  "ind\uFFFDstria": "Indústria",
};

function canonicalizeSector(raw: string): string {
  let s = raw.trim();

  // 1. Try latin1→utf8 repair if contains mojibake markers
  if (/[\u00C3\u00C2]/.test(s)) {
    try {
      const buf = Buffer.from(s, "latin1");
      const repaired = buf.toString("utf8");
      // Only use if it looks better (no replacement chars and shorter or same)
      if (!repaired.includes("\uFFFD") && repaired.length <= s.length + 2) {
        s = repaired;
      }
    } catch {
      // ignore
    }
  }

  // 2. Manual fixes for known irrecoverable patterns
  const lower = s.toLowerCase();
  for (const [pattern, fix] of Object.entries(MANUAL_FIXES)) {
    if (lower.includes(pattern)) {
      s = s.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), fix);
    }
  }

  // 3. Remove replacement character
  s = s.replace(/\uFFFD/g, "");

  // 4. NFC normalize
  try {
    s = s.normalize("NFC");
  } catch {
    // ignore
  }

  // 5. Collapse spaces
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
