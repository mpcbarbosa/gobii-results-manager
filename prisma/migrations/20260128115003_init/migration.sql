-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATIONS_LEAD', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'REVIEWING', 'QUALIFIED', 'DISQUALIFIED', 'CONTACTED', 'ENGAGED', 'NURTURING', 'READY_HANDOFF', 'HANDED_OFF', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InteractionChannel" AS ENUM ('PHONE', 'EMAIL', 'LINKEDIN', 'MEETING', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "InteractionOutcome" AS ENUM ('SUCCESSFUL', 'NO_ANSWER', 'VOICEMAIL', 'WRONG_CONTACT', 'NOT_INTERESTED', 'CALLBACK_LATER', 'MEETING_BOOKED', 'INFO_SENT', 'OTHER');

-- CreateEnum
CREATE TYPE "HandoffTeam" AS ENUM ('MARKETING', 'SALES', 'PARTNERSHIPS', 'CUSTOMER_SUCCESS');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "location" TEXT,
    "country" TEXT,
    "description" TEXT,
    "linkedin_url" TEXT,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "title" TEXT,
    "seniority" TEXT,
    "department" TEXT,
    "score" DOUBLE PRECISION,
    "score_details" JSONB,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "status_reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "raw_data" JSONB,
    "enriched_data" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "score_data" JSONB NOT NULL,
    "version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "avatar" TEXT,
    "phone" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignments" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "from_status" "LeadStatus",
    "to_status" "LeadStatus" NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "department" TEXT,
    "seniority" TEXT,
    "linkedin_url" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "contact_id" UUID,
    "channel" "InteractionChannel" NOT NULL,
    "outcome" "InteractionOutcome",
    "subject" TEXT,
    "notes" TEXT,
    "duration" INTEGER,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "user_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoffs" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "to_team" "HandoffTeam" NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_by_id" UUID NOT NULL,
    "accepted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,

    CONSTRAINT "handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_name_key" ON "sources"("name");

-- CreateIndex
CREATE INDEX "sources_isActive_idx" ON "sources"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_domain_key" ON "accounts"("domain");

-- CreateIndex
CREATE INDEX "accounts_name_normalized_idx" ON "accounts"("name_normalized");

-- CreateIndex
CREATE INDEX "accounts_domain_idx" ON "accounts"("domain");

-- CreateIndex
CREATE INDEX "accounts_deleted_at_idx" ON "accounts"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_dedupe_key_key" ON "leads"("dedupe_key");

-- CreateIndex
CREATE INDEX "leads_source_id_idx" ON "leads"("source_id");

-- CreateIndex
CREATE INDEX "leads_account_id_idx" ON "leads"("account_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_priority_idx" ON "leads"("priority");

-- CreateIndex
CREATE INDEX "leads_score_idx" ON "leads"("score");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "leads_deleted_at_idx" ON "leads"("deleted_at");

-- CreateIndex
CREATE INDEX "scoring_runs_lead_id_idx" ON "scoring_runs"("lead_id");

-- CreateIndex
CREATE INDEX "scoring_runs_source_id_idx" ON "scoring_runs"("source_id");

-- CreateIndex
CREATE INDEX "scoring_runs_created_at_idx" ON "scoring_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "lead_assignments_lead_id_idx" ON "lead_assignments"("lead_id");

-- CreateIndex
CREATE INDEX "lead_assignments_user_id_idx" ON "lead_assignments"("user_id");

-- CreateIndex
CREATE INDEX "lead_assignments_assigned_at_idx" ON "lead_assignments"("assigned_at");

-- CreateIndex
CREATE INDEX "lead_assignments_unassigned_at_idx" ON "lead_assignments"("unassigned_at");

-- CreateIndex
CREATE INDEX "lead_status_history_lead_id_idx" ON "lead_status_history"("lead_id");

-- CreateIndex
CREATE INDEX "lead_status_history_changed_by_id_idx" ON "lead_status_history"("changed_by_id");

-- CreateIndex
CREATE INDEX "lead_status_history_changed_at_idx" ON "lead_status_history"("changed_at");

-- CreateIndex
CREATE INDEX "lead_status_history_to_status_idx" ON "lead_status_history"("to_status");

-- CreateIndex
CREATE INDEX "contacts_account_id_idx" ON "contacts"("account_id");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_full_name_idx" ON "contacts"("full_name");

-- CreateIndex
CREATE INDEX "contacts_is_primary_idx" ON "contacts"("is_primary");

-- CreateIndex
CREATE INDEX "contacts_deleted_at_idx" ON "contacts"("deleted_at");

-- CreateIndex
CREATE INDEX "interactions_lead_id_idx" ON "interactions"("lead_id");

-- CreateIndex
CREATE INDEX "interactions_contact_id_idx" ON "interactions"("contact_id");

-- CreateIndex
CREATE INDEX "interactions_user_id_idx" ON "interactions"("user_id");

-- CreateIndex
CREATE INDEX "interactions_channel_idx" ON "interactions"("channel");

-- CreateIndex
CREATE INDEX "interactions_outcome_idx" ON "interactions"("outcome");

-- CreateIndex
CREATE INDEX "interactions_scheduled_at_idx" ON "interactions"("scheduled_at");

-- CreateIndex
CREATE INDEX "interactions_completed_at_idx" ON "interactions"("completed_at");

-- CreateIndex
CREATE INDEX "interactions_created_at_idx" ON "interactions"("created_at");

-- CreateIndex
CREATE INDEX "handoffs_lead_id_idx" ON "handoffs"("lead_id");

-- CreateIndex
CREATE INDEX "handoffs_to_team_idx" ON "handoffs"("to_team");

-- CreateIndex
CREATE INDEX "handoffs_status_idx" ON "handoffs"("status");

-- CreateIndex
CREATE INDEX "handoffs_created_by_id_idx" ON "handoffs"("created_by_id");

-- CreateIndex
CREATE INDEX "handoffs_accepted_by_id_idx" ON "handoffs"("accepted_by_id");

-- CreateIndex
CREATE INDEX "handoffs_created_at_idx" ON "handoffs"("created_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
