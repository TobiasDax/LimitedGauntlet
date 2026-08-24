-- Free-text description/blurb for a tournament (may contain external links,
-- e.g. Outline pages). Rendered safely as text-plus-links on the client.
ALTER TABLE "Tournament" ADD COLUMN "description" TEXT;
