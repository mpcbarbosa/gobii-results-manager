import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { LeadStatus } from "@prisma/client";
import {
  deriveCommercialSignal,
  type ActivityInput,
} from "@/lib/crm/deriveCommercialSignal";
import { deriveLeadTemperature } from "@/lib/crm/deriveLeadTemperature";
import { deriveHumanSLA } from "@/lib/crm/deriveHumanSLA";

const TERMINAL_STATUSES: LeadStatus[] = [
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.DISCARDED,
];

const TEMP_ORDER: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 };
const SLA_ORDER: Record<string, number> = { OVERDUE: 0, WARNING: 1, OK: 2 };

/**
 * GET /api/admin/leads/work-queue
 *
 * Prioritised list of non-terminal leads with signal, temperature, and SLA.
 * Optional query param: ?ownerId=<uuid> to filter by owner (used by my-queue).
 */
export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const ownerIdFilter = searchParams.get("ownerId") || undefined;
    const sortMode = searchParams.get("sort") || "temperature"; // "temperature" | "sla"

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const where: Record<string, unknown> = {
      deletedAt: null,
      status: { notIn: TERMINAL_STATUSES },
    };

    if (ownerIdFilter) {
      where.ownerId = ownerIdFilter;
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        account: {
          select: { id: true, name: true, domain: true },
        },
        source: {
          select: { name: true },
        },
        ownerUser: {
          select: { id: true, name: true, email: true },
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
      const sla = deriveHumanSLA(
        lead.lastHumanActivityAt,
        lead.createdAt,
      );

      return {
        id: lead.id,
        company: lead.account.name,
        domain: lead.account.domain,
        source: lead.source.name,
        status: lead.status,
        score_final: lead.score,
        ownerId: lead.ownerId,
        ownerName: lead.ownerUser?.name ?? null,
        signalLevel: signal.signalLevel,
        temperature,
        reasons: signal.reasons,
        lastSignalAt: signal.lastSignalAt,
        lastSignalCategory: signal.lastSignalCategory,
        lastSignalAgent: signal.lastSignalAgent,
        lastSignalSourceUrl: signal.lastSignalSourceUrl,
        lastSignalConfidence: signal.lastSignalConfidence,
        lastActivityAt: lead.lastActivityAt,
        lastHumanActivityAt: lead.lastHumanActivityAt,
        sla: {
          status: sla.status,
          label: sla.label,
          hoursElapsed: Math.round(sla.hoursElapsed),
        },
      };
    });

    // Sort based on mode
    if (sortMode === "sla") {
      // SLA sort: OVERDUE first → WARNING → OK, then temperature, then signal
      enriched.sort((a, b) => {
        const slaDiff =
          (SLA_ORDER[a.sla.status] ?? 99) - (SLA_ORDER[b.sla.status] ?? 99);
        if (slaDiff !== 0) return slaDiff;

        const tempDiff =
          (TEMP_ORDER[a.temperature] ?? 99) -
          (TEMP_ORDER[b.temperature] ?? 99);
        if (tempDiff !== 0) return tempDiff;

        const aSignal = a.lastSignalAt
          ? new Date(a.lastSignalAt).getTime()
          : 0;
        const bSignal = b.lastSignalAt
          ? new Date(b.lastSignalAt).getTime()
          : 0;
        return bSignal - aSignal;
      });
    } else {
      // Default: temperature → lastSignalAt → score
      enriched.sort((a, b) => {
        const tempDiff =
          (TEMP_ORDER[a.temperature] ?? 99) -
          (TEMP_ORDER[b.temperature] ?? 99);
        if (tempDiff !== 0) return tempDiff;

        const aSignal = a.lastSignalAt
          ? new Date(a.lastSignalAt).getTime()
          : 0;
        const bSignal = b.lastSignalAt
          ? new Date(b.lastSignalAt).getTime()
          : 0;
        if (aSignal !== bSignal) return bSignal - aSignal;

        const aScore = a.score_final ?? -1;
        const bScore = b.score_final ?? -1;
        return bScore - aScore;
      });
    }

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
