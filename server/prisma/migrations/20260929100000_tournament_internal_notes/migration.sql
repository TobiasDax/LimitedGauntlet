-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "internalNotesEditedAt" TIMESTAMP(3),
ADD COLUMN     "internalNotesEditedById" TEXT;

