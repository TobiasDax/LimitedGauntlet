-- PI-100 — on-demand side events.
--   * Pod.capacity: optional target headcount for an on-demand pod (null = no
--     cap, today's behaviour). Drives the "6 / 8" / "ready" cue in the
--     On-demand tab; never an auto-fire trigger.
--   * Round.onDemandWithdrawals: set only on a pod's round 1, only when
--     generating it auto-withdrew entrants from other not-yet-started on-demand
--     pods — records enough to re-add them if round 1 is later un-paired.

-- AlterTable
ALTER TABLE "Pod" ADD COLUMN "capacity" INTEGER;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN "onDemandWithdrawals" JSONB;
