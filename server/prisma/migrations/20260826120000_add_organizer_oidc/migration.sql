-- OIDC login support (PI-42): make the local password optional (SSO-only
-- accounts have none) and add the linked OIDC subject.

-- AlterTable
ALTER TABLE "OrganizerAccount" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "OrganizerAccount" ADD COLUMN "oidcSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerAccount_oidcSubject_key" ON "OrganizerAccount"("oidcSubject");
