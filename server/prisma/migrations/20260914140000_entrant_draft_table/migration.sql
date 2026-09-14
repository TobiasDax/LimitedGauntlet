-- PI-115 — Entrant.draftTable: which physical draft table this entrant sits
-- at when a large draft/chaos-draft pod's round 1 was split into multiple
-- tables (null = not split / single-table pod). Purely a physical-seating
-- concern, never read by the pairing engine or standings. Nullable,
-- additive, no backfill needed.

-- AlterTable
ALTER TABLE "Entrant" ADD COLUMN "draftTable" INTEGER;
