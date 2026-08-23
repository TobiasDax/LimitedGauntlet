-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PodFormat" AS ENUM ('DRAFT', 'SEALED', 'CHAOS_DRAFT', 'CONSTRUCTED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MatchFormat" AS ENUM ('BO1', 'BO3');

-- CreateEnum
CREATE TYPE "PodStatus" AS ENUM ('SETUP', 'PAIRING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('PENDING', 'A_WINS', 'B_WINS', 'DRAW');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "TournamentStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayer" (
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("tournamentId","playerId")
);

-- CreateTable
CREATE TABLE "Pod" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "format" "PodFormat" NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "isTeamEvent" BOOLEAN NOT NULL DEFAULT false,
    "teamSize" INTEGER,
    "roundCount" INTEGER NOT NULL DEFAULT 3,
    "matchFormat" "MatchFormat" NOT NULL DEFAULT 'BO3',
    "pointsWin" INTEGER NOT NULL DEFAULT 3,
    "pointsDraw" INTEGER NOT NULL DEFAULT 1,
    "pointsLoss" INTEGER NOT NULL DEFAULT 0,
    "roundLengthMinutes" INTEGER NOT NULL DEFAULT 50,
    "packConfig" TEXT,
    "rarepicUrl" TEXT,
    "status" "PodStatus" NOT NULL DEFAULT 'SETUP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","playerId")
);

-- CreateTable
CREATE TABLE "Entrant" (
    "id" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "playerId" TEXT,
    "teamId" TEXT,
    "droppedAfterRound" INTEGER,

    CONSTRAINT "Entrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "entrantAId" TEXT NOT NULL,
    "entrantBId" TEXT,
    "gamesWonA" INTEGER NOT NULL DEFAULT 0,
    "gamesWonB" INTEGER NOT NULL DEFAULT 0,
    "result" "MatchResult" NOT NULL DEFAULT 'PENDING',
    "reportedAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPull" (
    "id" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "playerId" TEXT,
    "cardName" TEXT NOT NULL,
    "scryfallId" TEXT,
    "setCode" TEXT,
    "priceEur" DECIMAL(10,2),
    "imageUri" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerAccount_email_key" ON "OrganizerAccount"("email");

-- CreateIndex
CREATE INDEX "OrganizerAccount_orgId_idx" ON "OrganizerAccount"("orgId");

-- CreateIndex
CREATE INDEX "Player_orgId_idx" ON "Player"("orgId");

-- CreateIndex
CREATE INDEX "Tournament_orgId_idx" ON "Tournament"("orgId");

-- CreateIndex
CREATE INDEX "Pod_tournamentId_idx" ON "Pod"("tournamentId");

-- CreateIndex
CREATE INDEX "Team_podId_idx" ON "Team"("podId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrant_teamId_key" ON "Entrant"("teamId");

-- CreateIndex
CREATE INDEX "Entrant_podId_idx" ON "Entrant"("podId");

-- CreateIndex
CREATE INDEX "Entrant_playerId_idx" ON "Entrant"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_podId_roundNumber_key" ON "Round"("podId", "roundNumber");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_entrantAId_idx" ON "Match"("entrantAId");

-- CreateIndex
CREATE INDEX "Match_entrantBId_idx" ON "Match"("entrantBId");

-- CreateIndex
CREATE INDEX "CardPull_podId_idx" ON "CardPull"("podId");

-- AddForeignKey
ALTER TABLE "OrganizerAccount" ADD CONSTRAINT "OrganizerAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pod" ADD CONSTRAINT "Pod_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_entrantAId_fkey" FOREIGN KEY ("entrantAId") REFERENCES "Entrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_entrantBId_fkey" FOREIGN KEY ("entrantBId") REFERENCES "Entrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPull" ADD CONSTRAINT "CardPull_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPull" ADD CONSTRAINT "CardPull_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
