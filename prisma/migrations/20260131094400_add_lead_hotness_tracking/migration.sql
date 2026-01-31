-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "seen_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "last_seen_at" TIMESTAMP(3);
