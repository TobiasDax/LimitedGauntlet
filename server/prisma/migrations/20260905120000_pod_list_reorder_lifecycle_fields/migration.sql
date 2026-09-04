-- AlterTable
ALTER TABLE "Pod" ADD COLUMN     "actualStartedAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "isOnDemand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "podsManuallyReordered" BOOLEAN NOT NULL DEFAULT false;
