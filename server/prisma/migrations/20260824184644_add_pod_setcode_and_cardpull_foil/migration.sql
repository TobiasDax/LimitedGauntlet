-- AlterTable
ALTER TABLE "CardPull" ADD COLUMN     "foil" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pod" ADD COLUMN     "setCode" TEXT;
