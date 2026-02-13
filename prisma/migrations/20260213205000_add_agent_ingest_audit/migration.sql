-- CreateTable
CREATE TABLE "agent_ingest_audit" (
    "id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_ingest_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_ingest_audit_agent_idx" ON "agent_ingest_audit"("agent");
CREATE INDEX "agent_ingest_audit_created_at_idx" ON "agent_ingest_audit"("created_at");
CREATE INDEX "agent_ingest_audit_status_idx" ON "agent_ingest_audit"("status");
