/**
 * Agent Ingest Audit helper.
 * Records audit trail for every ingest operation.
 * @module lib/crm/auditIngest
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface AuditParams {
  agent: string;
  endpoint: string;
  status: "SUCCESS" | "SKIPPED" | "ERROR";
  processed?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errorMessage?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Record an ingest audit entry. Non-blocking — errors are logged but don't propagate.
 */
export async function recordIngestAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.agentIngestAudit.create({
      data: {
        agent: params.agent || "unknown",
        endpoint: params.endpoint,
        status: params.status,
        processed: params.processed ?? 0,
        created: params.created ?? 0,
        updated: params.updated ?? 0,
        skipped: params.skipped ?? 0,
        errorMessage: params.errorMessage ?? null,
        meta: params.meta ? (params.meta as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    console.error("[auditIngest] Failed to record audit:", err);
  }
}
