-- CreateTable
CREATE TABLE "sector_intelligence" (
    "id" UUID NOT NULL,
    "sector" TEXT NOT NULL,
    "growth" TEXT,
    "investment_intensity" TEXT,
    "maturity" TEXT,
    "erp_probability" TEXT,
    "source" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sector_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sector_intelligence_sector_idx" ON "sector_intelligence"("sector");

-- CreateIndex
CREATE INDEX "sector_intelligence_detected_at_idx" ON "sector_intelligence"("detected_at");
