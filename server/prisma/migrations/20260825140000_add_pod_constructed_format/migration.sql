-- CreateEnum
CREATE TYPE "ConstructedFormat" AS ENUM ('STANDARD', 'MODERN', 'LEGACY', 'VINTAGE', 'PIONEER', 'PRE_MODERN', 'PAUPER', 'CUSTOM');

-- AlterTable
ALTER TABLE "Pod" ADD COLUMN "constructedFormat" "ConstructedFormat",
ADD COLUMN "constructedFormatCustom" TEXT;
