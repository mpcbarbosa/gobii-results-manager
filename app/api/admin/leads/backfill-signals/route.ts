import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { LeadStatus, Prisma } from "@prisma/client";
import { parseSystemMeta } from "@/lib/crm/parseSystemMeta";
import { normalizeProbability } from "@/lib/format";

/**
 * POST /api/admin/leads/backfill-signals
 *
 * Creates inferred SYSTEM activities for leads that have no recent
 * system signals. Idempotent and safe to re-run.
 *
 * Auth: requireAdminAuth
 */

const TERMINAL_STATUSES: LeadStatus[] = [
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.DISCARDED,
];

const BACKFILL_TITLE = "Backfilled signal";
const BACKFILL_AGENT = "Backfill";

// ---------------------------------------------------------------------------
// Category inference (deterministic, no external calls)
// ---------------------------------------------------------------------------

function inferCategory(trigger: string | null): string {
  if (!trigger) return "ERP_SIGNAL";
  const t = trigger.toLowerCase();

  if (/\brfp\b|concurso/.test(t)) return "RFP";
  if (/\bsap\b|s\/4|erp\s*replacement/i.test(t)) return "ERP_REPLACEMENT";
  if (/expans|fábrica|fabrica|logística|logistica|m&a/i.test(t)) return "EXPANSION";
  if (/\bcio\b|\bcto\b|\bcfo\b|\bcoo\b|it\s*director|head\s*of/i.test(t)) return "C_LEVEL";

  return "ERP_SIGNAL";
}

// ---------------------------------------------------------------------------
// Confidence inference
// ---------------------------------------------------------------------------

function inferConfidence(
  scoreDetails: Record<string, unknown> | null,
  probability: number | null | undefined,
): string {
  // Try scoreDetails.probability_value first, then scoreDetails.probability
  let raw: number | null = null;

  if (scoreDetails) {
    if (typeof scoreDetails.probability_value === "number") {
      raw = scoreDetails.probability_value;
    } else if (typeof scoreDetails.probability === "number") {
      raw = scoreDetails.probability;
    }
  }

  // Fallback to lead.probability (from enrichedData)
  if (raw === null && probability != null) {
    raw = probability;
  }

  if (raw === null) return "LOW";

  const normalized = normalizeProbability(raw);
  if (normalized === null) return "LOW";

  if (normalized >= 0.7) return "HIGH";
  if (normalized >= 0.4) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Format notes with meta header (compatible with parseSystemMeta)
// ---------------------------------------------------------------------------

function formatBackfillNotes(
  category: string,
  confidence: string,
  detectedAt: string,
): string {
  return [
    "Inferred signal from lead data (backfill).",
    "",
    "---",
    `Agent: ${BACKFILL_AGENT}`,
    `Category: ${category}`,
    `Confidence: ${confidence}`,
    `Detected: ${detectedAt}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface BackfillBody {
  take?: number;
  dryRun?: boolean;
  lookbackDays?: number;
  onlyIfNoSystemInDays?: number;
}

interface BackfillItem {
  leadId: string;
  company: string;
  domain: string | null;
  inferredCategory: string;
  inferredConfidence: string;
  created: boolean;
  reason: string;
}

export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  try {
    const body: BackfillBody = await request.json().catch(() => ({}));

    const take = Math.min(Math.max(body.take ?? 200, 1), 1000);
    const dryRun = body.dryRun !== false; // default true
    const lookbackDays = body.lookbackDays ?? 30;
    const onlyIfNoSystemInDays = body.onlyIfNoSystemInDays ?? 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - onlyIfNoSystemInDays);

    // Fetch non-terminal leads with their recent SYSTEM activities
    const leads = await prisma.lead.findMany({
      where: {
        deletedAt: null,
        status: { notIn: TERMINAL_STATUSES },
      },
      take,
      orderBy: { updatedAt: "desc" },
      include: {
        account: {
          select: { name: true, domain: true },
        },
        activities: {
          where: {
            type: "SYSTEM",
            createdAt: { gte: cutoff },
          },
          select: {
            id: true,
            title: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    // Get system user
    let systemUser = await prisma.user.findFirst({
      where: { email: "system@gobii.internal" },
    });

    if (!systemUser && !dryRun) {
      systemUser = await prisma.user.create({
        data: {
          email: "system@gobii.internal",
          name: "Gobii System",
          role: "ADMIN",
          isActive: true,
        },
      });
    }

    const items: BackfillItem[] = [];
    let created = 0;
    let skipped = 0;
    let eligible = 0;

    const today = new Date().toISOString().split("T")[0];

    for (const lead of leads) {
      // Check if lead has any SYSTEM activity in the lookback window
      if (lead.activities.length > 0) {
        skipped++;
        continue;
      }

      eligible++;

      // Extract trigger from enrichedData
      let trigger: string | null = null;
      if (
        lead.enrichedData &&
        typeof lead.enrichedData === "object" &&
        lead.enrichedData !== null
      ) {
        const enriched = lead.enrichedData as Record<string, unknown>;
        if (typeof enriched.trigger === "string") {
          trigger = enriched.trigger;
        }
      }

      const scoreDetails =
        lead.scoreDetails &&
        typeof lead.scoreDetails === "object" &&
        lead.scoreDetails !== null
          ? (lead.scoreDetails as Record<string, unknown>)
          : null;

      // Extract probability from scoreDetails or enrichedData
      let probability: number | null = null;
      if (scoreDetails) {
        if (typeof scoreDetails.probability_value === "number") {
          probability = scoreDetails.probability_value;
        } else if (typeof scoreDetails.probability === "number") {
          probability = scoreDetails.probability;
        }
      }

      const inferredCategory = inferCategory(trigger);
      const inferredConfidence = inferConfidence(scoreDetails, probability);

      // Idempotency check: look for existing backfill activity
      const existingBackfill = lead.activities.find((a) => {
        if (a.title !== BACKFILL_TITLE) return false;
        const meta = parseSystemMeta(a.notes);
        return (
          meta.agent === BACKFILL_AGENT && meta.category === inferredCategory
        );
      });

      if (existingBackfill) {
        items.push({
          leadId: lead.id,
          company: lead.account.name,
          domain: lead.account.domain,
          inferredCategory,
          inferredConfidence,
          created: false,
          reason: "Backfill already exists",
        });
        skipped++;
        eligible--;
        continue;
      }

      // Also check beyond the lookback window for idempotency
      if (!dryRun) {
        const lookbackCutoff = new Date();
        lookbackCutoff.setDate(lookbackCutoff.getDate() - lookbackDays);

        const existingGlobal = await prisma.activity.findFirst({
          where: {
            leadId: lead.id,
            type: "SYSTEM",
            title: BACKFILL_TITLE,
            createdAt: { gte: lookbackCutoff },
          },
        });

        if (existingGlobal) {
          const meta = parseSystemMeta(existingGlobal.notes);
          if (
            meta.agent === BACKFILL_AGENT &&
            meta.category === inferredCategory
          ) {
            items.push({
              leadId: lead.id,
              company: lead.account.name,
              domain: lead.account.domain,
              inferredCategory,
              inferredConfidence,
              created: false,
              reason: "Backfill already exists (extended check)",
            });
            skipped++;
            eligible--;
            continue;
          }
        }
      }

      if (dryRun) {
        items.push({
          leadId: lead.id,
          company: lead.account.name,
          domain: lead.account.domain,
          inferredCategory,
          inferredConfidence,
          created: false,
          reason: "Would create (dry run)",
        });
      } else {
        // Create the backfill activity
        const detectedAt =
          lead.updatedAt?.toISOString().split("T")[0] ?? today;
        const notes = formatBackfillNotes(
          inferredCategory,
          inferredConfidence,
          detectedAt,
        );

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.activity.create({
            data: {
              leadId: lead.id,
              type: "SYSTEM",
              title: BACKFILL_TITLE,
              notes,
              createdById: systemUser!.id,
            },
          });

          await tx.lead.update({
            where: { id: lead.id },
            data: { lastActivityAt: new Date() },
          });
        });

        created++;
        items.push({
          leadId: lead.id,
          company: lead.account.name,
          domain: lead.account.domain,
          inferredCategory,
          inferredConfidence,
          created: true,
          reason: "Created",
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      scanned: leads.length,
      eligible,
      created,
      skipped,
      items,
    });
  } catch (error) {
    console.error("[backfill-signals] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
