-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "webhookUrl" TEXT,
ADD COLUMN "webhookSecret" TEXT;

-- AlterTable
ALTER TABLE "Pod" ADD COLUMN "webhookEnabled" BOOLEAN NOT NULL DEFAULT true;
