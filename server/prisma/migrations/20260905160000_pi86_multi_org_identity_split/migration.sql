-- PI-86 — split membership out of identity so one login can belong to several
-- organizations.
--   * OrganizerAccount loses `orgId`; the new OrganizerMembership join row
--     carries it. One membership backfilled per existing account.
--   * ApiToken gains `orgId` (a token now acts in one explicit org, not "the"
--     org inherited from a single-org account). Backfilled from the account's
--     old `orgId`.
--   * Player loses `passwordHash`/`authVersion`; the new PlayerIdentity row
--     carries them + the email. One identity backfilled per distinct email
--     across Player rows that had a login; every such Player row is linked to
--     it. Where the same person had a login in >1 org (independent passwords
--     today), the most recently created row's password wins and the highest
--     authVersion is kept.
-- Column drops happen last, after every backfill has read the old values.

-- ── New tables (no FKs/unique indexes yet) ────────────────────────────────
CREATE TABLE "OrganizerMembership" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizerMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerIdentity" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL DEFAULT 0,
    "lastActiveOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerIdentity_pkey" PRIMARY KEY ("id")
);

-- ── New columns, nullable for the backfill ────────────────────────────────
ALTER TABLE "ApiToken" ADD COLUMN "orgId" TEXT;
ALTER TABLE "OrganizerAccount" ADD COLUMN "lastActiveOrgId" TEXT;
ALTER TABLE "Player" ADD COLUMN "identityId" TEXT;

-- ── Backfill: one membership per existing account ─────────────────────────
INSERT INTO "OrganizerMembership" ("id", "accountId", "orgId", "createdAt")
SELECT gen_random_uuid()::text, "id", "orgId", "createdAt"
FROM "OrganizerAccount";

-- ── Backfill: token org from the account's old single org ─────────────────
UPDATE "ApiToken" t
SET "orgId" = a."orgId"
FROM "OrganizerAccount" a
WHERE t."organizerId" = a."id";

-- ── Backfill: one PlayerIdentity per distinct login email ─────────────────
INSERT INTO "PlayerIdentity" ("id", "email", "passwordHash", "authVersion", "createdAt")
SELECT
  gen_random_uuid()::text,
  sub."email",
  sub."passwordHash",
  (SELECT MAX(p2."authVersion") FROM "Player" p2
     WHERE p2."email" = sub."email" AND p2."passwordHash" IS NOT NULL),
  (SELECT MIN(p2."createdAt") FROM "Player" p2
     WHERE p2."email" = sub."email" AND p2."passwordHash" IS NOT NULL)
FROM (
  SELECT DISTINCT ON (p."email") p."email", p."passwordHash"
  FROM "Player" p
  WHERE p."email" IS NOT NULL AND p."passwordHash" IS NOT NULL
  ORDER BY p."email", p."createdAt" DESC
) sub;

UPDATE "Player" p
SET "identityId" = pi."id"
FROM "PlayerIdentity" pi
WHERE p."email" = pi."email" AND p."passwordHash" IS NOT NULL;

-- ── Lock down the token org now that it's populated ───────────────────────
ALTER TABLE "ApiToken" ALTER COLUMN "orgId" SET NOT NULL;

-- ── Indexes + foreign keys ───────────────────────────────────────────────
CREATE UNIQUE INDEX "OrganizerMembership_accountId_orgId_key" ON "OrganizerMembership"("accountId", "orgId");
CREATE INDEX "OrganizerMembership_orgId_idx" ON "OrganizerMembership"("orgId");
CREATE UNIQUE INDEX "PlayerIdentity_email_key" ON "PlayerIdentity"("email");
CREATE INDEX "ApiToken_orgId_idx" ON "ApiToken"("orgId");
CREATE INDEX "Player_identityId_idx" ON "Player"("identityId");

ALTER TABLE "OrganizerMembership" ADD CONSTRAINT "OrganizerMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OrganizerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizerMembership" ADD CONSTRAINT "OrganizerMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlayerIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Drop the old single-org columns (backfills above have consumed them) ──
ALTER TABLE "OrganizerAccount" DROP CONSTRAINT "OrganizerAccount_orgId_fkey";
DROP INDEX "OrganizerAccount_orgId_idx";
ALTER TABLE "OrganizerAccount" DROP COLUMN "orgId";
ALTER TABLE "Player" DROP COLUMN "authVersion";
ALTER TABLE "Player" DROP COLUMN "passwordHash";
