-- Track individually drawn games (e.g. a Bo3 that ends 1-1-1, or a game that
-- times out unfinished). Not credited to either player, but counted as games
-- played so game-win% is diluted per the MTR / larger-tournament convention.
ALTER TABLE "Match" ADD COLUMN "gamesDrawn" INTEGER NOT NULL DEFAULT 0;
