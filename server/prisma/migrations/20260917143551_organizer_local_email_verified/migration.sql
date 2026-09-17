-- AlterTable
ALTER TABLE "OrganizerAccount" ADD COLUMN     "localEmailVerifiedAt" TIMESTAMP(3);

-- PI-125 — grandfather every account that already exists as of this migration
-- in as verified (backfilled to its own createdAt), so this fix only changes
-- behavior for accounts created going forward. Deliberate: not verifying
-- everyone automatically going forward would break every existing deployment's
-- organizers the next time they try to link SSO to their current account.
UPDATE "OrganizerAccount" SET "localEmailVerifiedAt" = "createdAt" WHERE "localEmailVerifiedAt" IS NULL;
