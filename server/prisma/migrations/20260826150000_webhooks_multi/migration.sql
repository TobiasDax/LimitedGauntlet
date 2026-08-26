-- CreateTable
CREATE TABLE "OrganizationWebhook" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationWebhook_orgId_idx" ON "OrganizationWebhook"("orgId");

-- AddForeignKey
ALTER TABLE "OrganizationWebhook" ADD CONSTRAINT "OrganizationWebhook_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate any existing single webhook config into the new table before
-- dropping the old columns.
INSERT INTO "OrganizationWebhook" ("id", "orgId", "url", "secret", "createdAt")
SELECT gen_random_uuid()::text, "id", "webhookUrl", "webhookSecret", CURRENT_TIMESTAMP
FROM "Organization"
WHERE "webhookUrl" IS NOT NULL AND "webhookSecret" IS NOT NULL;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "webhookUrl",
DROP COLUMN "webhookSecret";
