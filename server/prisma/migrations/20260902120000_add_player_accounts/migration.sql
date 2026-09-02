-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "email" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerInvite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvite_tokenHash_key" ON "PlayerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PlayerInvite_orgId_idx" ON "PlayerInvite"("orgId");

-- CreateIndex
CREATE INDEX "PlayerInvite_playerId_idx" ON "PlayerInvite"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_orgId_email_key" ON "Player"("orgId", "email");

-- AddForeignKey
ALTER TABLE "PlayerInvite" ADD CONSTRAINT "PlayerInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInvite" ADD CONSTRAINT "PlayerInvite_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInvite" ADD CONSTRAINT "PlayerInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "OrganizerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
