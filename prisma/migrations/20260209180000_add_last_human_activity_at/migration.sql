-- AlterTable
ALTER TABLE "leads" ADD COLUMN "last_human_activity_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_owner_id_idx" ON "leads"("owner_id");
