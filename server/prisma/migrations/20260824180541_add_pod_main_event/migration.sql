-- AlterTable
ALTER TABLE "Pod" ADD COLUMN     "isMainEvent" BOOLEAN NOT NULL DEFAULT false;

-- Partial unique index: at most one main-event pod per tournament. Prisma's
-- schema DSL can't express a WHERE-qualified unique constraint, so this is
-- hand-added on top of the generated column. The real guarantee against a
-- race condition (app-layer code in podRoutes also unsets any sibling
-- first, but that alone can't rule out a race) — a second concurrent
-- request trying to also set isMainEvent: true for a different pod in the
-- same tournament will hit this constraint and fail loudly instead of
-- silently leaving two "main event" pods.
CREATE UNIQUE INDEX "Pod_tournamentId_main_event_unique" ON "Pod"("tournamentId") WHERE "isMainEvent" = true;
