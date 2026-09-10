-- PI-110 — Player.publicAlias: a stable, per-org-unique public handle
-- ("Player 7F2A") generated the first time publicHiddenAt is set. Rendered on
-- the public pages in place of the real display name while the player is
-- hidden. Nullable, additive, no backfill (no existing hidden players carry a
-- handle yet — setPlayerPublicHidden backfills one on the next toggle).

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "publicAlias" TEXT;
