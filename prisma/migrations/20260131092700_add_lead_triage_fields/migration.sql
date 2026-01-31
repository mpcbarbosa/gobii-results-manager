-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "owner" TEXT,
ADD COLUMN     "next_action_at" TIMESTAMP(3);
