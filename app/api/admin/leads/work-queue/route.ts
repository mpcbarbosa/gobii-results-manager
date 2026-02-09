import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { LeadStatus } from "@prisma/client";
import {
  deriveCommercialSignal,
  type ActivityInput,
} from "@/lib/crm/deriveCommercialSignal";
import { deriveLeadTemperature } from "@/lib/crm/deriveLeadTemperature";

/**
 * Terminal statuses excluded from the work queue.
 * Leads in these statuses are considered "done" and should not appear.
 */
const TERMINAL_STATUSES: LeadStatus[] = [
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.DISCARDED,
];

/** Temperature sort priority (lower = higher priority) */
const TEMP_ORDER: Record<string, number> = {
  HOT: 0,
  WARM: 1,
  COLD: 2,
};

/**
 * GET /api/admin/leads/work-queue
 *
 * Returns a prioritised list of non-terminal leads enriched with
 * derived commercial signal and temperature.
 *
 * Ordering:
 *   1. temperature  — HOT → WARM → COLD
 *   2. lastSignalAt — most recent first
 *   3. score_final  — descending
 *
 * Authentication: requireAdminAuth (Bearer token or session cookie)
 */
export async function GET(request: Request) {
  // --- Auth ---
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  try {
    // 30 days ago — window for SYSTEM activities
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch non-terminal leads with their SYSTEM activities (last 30 days)
    const leads = await prisma.lead.findMany({
      where: {
        deletedAt: null,
        status: {
          notIn: TERMINAL_STATUSES,
        },
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            domain: true,
          },
        },
        source: {
          select: {
            name: true,
          },
        },
        activities: {
          where: {
            type: "SYSTEM",
            createdAt: { gte: thirtyDaysAgo },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            title: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    // Enrich each lead with derived signal + temperature
    const enriched = leads.map((lead) => {
      const systemActivities: ActivityInput[] = lead.activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        notes: a.notes,
        createdAt: a.createdAt,
      }));

      const signal = deriveCommercialSignal(systemActivities);
      const temperature = deriveLeadTemperature(signal.signalLevel);

      return {
        id: lead.id,
        company: lead.account.name,
        domain: lead.account.domain,
        source: lead.source.name,
        status: lead.status,
        score_final: lead.score,
        signalLevel: signal.signalLevel,
        temperature,
        reasons: signal.reasons,
        lastSignalAt: signal.lastSignalAt,
        lastSignalCategory: signal.lastSignalCategory,
        lastSignalAgent: signal.lastSignalAgent,
        lastSignalSourceUrl: signal.lastSignalSourceUrl,
        lastSignalConfidence: signal.lastSignalConfidence,
        lastActivityAt: lead.lastActivityAt,
      };
    });

    // Sort: temperature ASC → lastSignalAt DESC → score_final DESC
    enriched.sort((a, b) => {
      // 1. Temperature priority
      const tempDiff =
        (TEMP_ORDER[a.temperature] ?? 99) - (TEMP_ORDER[b.temperature] ?? 99);
      if (tempDiff !== 0) return tempDiff;

      // 2. Last signal date (most recent first, nulls last)
      const aSignal = a.lastSignalAt ? new Date(a.lastSignalAt).getTime() : 0;
      const bSignal = b.lastSignalAt ? new Date(b.lastSignalAt).getTime() : 0;
      if (aSignal !== bSignal) return bSignal - aSignal;

      // 3. Score descending (nulls last)
      const aScore = a.score_final ?? -1;
      const bScore = b.score_final ?? -1;
      return bScore - aScore;
    });

    return NextResponse.json({
      success: true,
      count: enriched.length,
      items: enriched,
    });
  } catch (error) {
    console.error("[work-queue] Error:", error);
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
