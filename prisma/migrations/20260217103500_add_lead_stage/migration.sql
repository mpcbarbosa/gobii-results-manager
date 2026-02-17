-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'ASSUMED', 'QUALIFIED', 'CONTACTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
ADD COLUMN "owner_assigned_at" TIMESTAMP(3),
ADD COLUMN "discarded_at" TIMESTAMP(3),
ADD COLUMN "discard_reason" TEXT;
