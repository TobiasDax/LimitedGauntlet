-- CreateEnum
CREATE TYPE "TokenTxnReason" AS ENUM ('POD_PARTICIPATION', 'POD_STANDING', 'MANUAL', 'INITIAL');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "tokensEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "tokenParticipation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokenStandingBonuses" JSONB;

-- AlterTable
ALTER TABLE "Pod" ADD COLUMN     "tokenParticipation" INTEGER,
ADD COLUMN     "tokenStandingBonuses" JSONB;

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "TokenTxnReason" NOT NULL,
    "note" TEXT,
    "podId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenTransaction_orgId_playerId_idx" ON "TokenTransaction"("orgId", "playerId");

-- CreateIndex
CREATE INDEX "TokenTransaction_podId_idx" ON "TokenTransaction"("podId");

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "OrganizerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
