-- CreateTable
CREATE TABLE "OrganizerInvite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerInvite_tokenHash_key" ON "OrganizerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizerInvite_orgId_idx" ON "OrganizerInvite"("orgId");

-- AddForeignKey
ALTER TABLE "OrganizerInvite" ADD CONSTRAINT "OrganizerInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerInvite" ADD CONSTRAINT "OrganizerInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "OrganizerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
