-- PI-104 / PI-107 — GDPR player privacy fields.
--   * Player.anonymisedAt: set when an organizer anonymises a roster entry to
--     honour an Art. 17 erasure request. The name is scrubbed to a
--     non-identifying label and login/invite/token-note data is cleared, but
--     the player's Entrant / Match / CardPull / TokenTransaction rows are kept
--     so historical standings are unchanged.
--   * Player.publicHiddenAt: set when a player objects (Art. 21) to appearing
--     on the open public pages. The public routes then render their name as a
--     placeholder; organizer views and standings math are unaffected.
-- Both nullable, additive, no backfill.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "anonymisedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "publicHiddenAt" TIMESTAMP(3);
