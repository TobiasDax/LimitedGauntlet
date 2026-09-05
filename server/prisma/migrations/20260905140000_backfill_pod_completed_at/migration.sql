-- PI-77 shipped Pod.completedAt with no backfill, so on any database that
-- already had pods from before this migration (real deployments, not just
-- fresh installs), every pre-existing pod keeps completedAt = NULL forever —
-- nothing re-touches it, since syncPodTokenAwards only runs off subsequent
-- completion-changing actions. The pod-list "finished" partition (podOrder.ts)
-- reads that raw column, not the rounds-derived status the row label shows,
-- so those pods display "Finished" but never sink below the unfinished
-- group, and (being bucketed as unfinished) wrongly keep their reorder
-- arrows too.
--
-- One-time backfill using the exact same "finalRoundDone" criterion as
-- syncPodTokenAwards: the pod's last configured round is COMPLETED. No real
-- completion timestamp exists for this historical data, so completedAt is
-- stamped from the pod's createdAt — not accurate to the minute, but
-- monotonic per pod and good enough for the "sunk, sorted by completion
-- order" grouping this unblocks. Canceled pods are left alone: PI-84's
-- cancellation concept is new, so no pre-existing pod is canceled under it.
UPDATE "Pod" p
SET "completedAt" = p."createdAt"
FROM "Round" r
WHERE r."podId" = p.id
  AND r."roundNumber" = p."roundCount"
  AND r."status" = 'COMPLETED'
  AND p."completedAt" IS NULL
  AND p."canceledAt" IS NULL;
