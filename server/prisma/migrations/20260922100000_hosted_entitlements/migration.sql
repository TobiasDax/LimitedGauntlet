-- CreateEnum
CREATE TYPE "BillingEventSource" AS ENUM ('PROCESSOR', 'OPERATOR');

-- CreateEnum
CREATE TYPE "EntitlementTier" AS ENUM ('FREE', 'TOURNAMENT_PASS', 'SERIES');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "cumulativePaidMonths" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "entitlementTier" "EntitlementTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "freeTournamentUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retentionOverrideUntil" TIMESTAMP(3),
ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "coveringEntitlement" "EntitlementTier";

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "processorEventId" TEXT,
    "source" "BillingEventSource" NOT NULL,
    "tier" "EntitlementTier" NOT NULL,
    "amountCents" INTEGER,
    "currency" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidMonths" INTEGER NOT NULL DEFAULT 0,
    "tournamentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_processorEventId_key" ON "BillingEvent"("processorEventId");

-- CreateIndex
CREATE INDEX "BillingEvent_orgId_idx" ON "BillingEvent"("orgId");

-- CreateIndex
CREATE INDEX "BillingEvent_tournamentId_idx" ON "BillingEvent"("tournamentId");

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

