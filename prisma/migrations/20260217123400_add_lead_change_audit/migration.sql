-- CreateTable
CREATE TABLE "lead_changes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_user_id" UUID,
    "field" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "reason" TEXT,
    "meta" JSONB,

    CONSTRAINT "lead_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_changes_lead_id_idx" ON "lead_changes"("lead_id");
CREATE INDEX "lead_changes_changed_at_idx" ON "lead_changes"("changed_at");

-- AddForeignKey
ALTER TABLE "lead_changes" ADD CONSTRAINT "lead_changes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_changes" ADD CONSTRAINT "lead_changes_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
