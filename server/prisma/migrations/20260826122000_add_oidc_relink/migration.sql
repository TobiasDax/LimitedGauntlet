ALTER TABLE "OrganizerAccount" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OidcSubjectRelinkRequest" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "pendingSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SUBJECT_RELINK',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OidcSubjectRelinkRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OidcSubjectRelinkRequest_tokenHash_key" ON "OidcSubjectRelinkRequest"("tokenHash");
CREATE INDEX "OidcSubjectRelinkRequest_organizerId_idx" ON "OidcSubjectRelinkRequest"("organizerId");
ALTER TABLE "OidcSubjectRelinkRequest" ADD CONSTRAINT "OidcSubjectRelinkRequest_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
