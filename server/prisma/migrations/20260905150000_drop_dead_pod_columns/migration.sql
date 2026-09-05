-- PI-69: Pod.packConfig and Pod.rarepicUrl are early-design leftovers —
-- present since the initial migration, but never read or written anywhere
-- (no UI, no route logic, not round-tripped by orgExport.ts/orgImport.ts).
-- Dropping both; no user-facing effect.
ALTER TABLE "Pod" DROP COLUMN "packConfig",
DROP COLUMN "rarepicUrl";
