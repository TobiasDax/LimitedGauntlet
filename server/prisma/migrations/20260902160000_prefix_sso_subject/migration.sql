-- PI-43: SSO subjects are now provider-prefixed (`oidc:<sub>`, `google:…`,
-- `discord:…`) so multiple providers can't collide. Backfill the pre-PI-43
-- generic-OIDC values. The prefix guard makes this safe to re-run and a no-op
-- on a fresh database.
UPDATE "OrganizerAccount"
SET "oidcSubject" = 'oidc:' || "oidcSubject"
WHERE "oidcSubject" IS NOT NULL
  AND "oidcSubject" NOT LIKE 'oidc:%'
  AND "oidcSubject" NOT LIKE 'google:%'
  AND "oidcSubject" NOT LIKE 'discord:%';

UPDATE "OidcSubjectRelinkRequest"
SET "pendingSubject" = 'oidc:' || "pendingSubject"
WHERE "pendingSubject" IS NOT NULL
  AND "pendingSubject" NOT LIKE 'oidc:%'
  AND "pendingSubject" NOT LIKE 'google:%'
  AND "pendingSubject" NOT LIKE 'discord:%';
