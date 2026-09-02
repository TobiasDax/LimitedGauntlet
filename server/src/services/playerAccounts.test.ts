import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  acceptPlayerInvite,
  authenticatePlayer,
  createPlayerInvite,
  hashInviteToken,
  revokePlayerAccount,
  submitPlayerResult,
} from "./playerAccounts.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug: `pa-${unique}`, name: "PA Org" } });
  const organizer = await prisma.organizerAccount.create({
    data: { orgId: org.id, name: "Org", email: `org-${unique}@example.com`, passwordHash: "x" },
  });
  const tournament = await prisma.tournament.create({
    data: { orgId: org.id, name: "T", startDate: new Date(), endDate: new Date() },
  });
  return { org, organizer, tournament, unique };
}

async function makePlayer(orgId: string, displayName: string) {
  return prisma.player.create({ data: { orgId, displayName } });
}

describe("player accounts (PI-52)", () => {
  it("invite → accept → login round trip", async () => {
    const { org, organizer, unique } = await setup();
    const player = await makePlayer(org.id, "Alice");
    const email = `alice-${unique}@example.com`;

    const { token } = await createPlayerInvite(org.id, player.id, organizer.id, email);
    const { player: accepted } = await acceptPlayerInvite(token, "hunter2!");
    expect(accepted.email).toBe(email);
    expect(accepted.passwordHash).toBeTruthy();

    const auth = await authenticatePlayer(org.slug, email, "hunter2!");
    expect(auth?.player.id).toBe(player.id);
    expect(await authenticatePlayer(org.slug, email, "wrong")).toBeNull();

    // The invite is single-use.
    await expect(acceptPlayerInvite(token, "another1!")).rejects.toMatchObject({ code: "invalid_or_expired" });
  });

  it("rejects an expired invite token", async () => {
    const { org, organizer, unique } = await setup();
    const player = await makePlayer(org.id, "Bob");
    const { token } = await createPlayerInvite(org.id, player.id, organizer.id, `bob-${unique}@example.com`);
    await prisma.playerInvite.updateMany({
      where: { tokenHash: hashInviteToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(acceptPlayerInvite(token, "hunter2!")).rejects.toMatchObject({ code: "invalid_or_expired" });
  });

  it("won't invite a player who already has an account", async () => {
    const { org, organizer, unique } = await setup();
    const player = await makePlayer(org.id, "Cara");
    const { token } = await createPlayerInvite(org.id, player.id, organizer.id, `cara-${unique}@example.com`);
    await acceptPlayerInvite(token, "hunter2!");
    await expect(
      createPlayerInvite(org.id, player.id, organizer.id, `cara2-${unique}@example.com`),
    ).rejects.toMatchObject({ code: "already_has_account" });
  });

  it("revoke clears credentials and bumps authVersion", async () => {
    const { org, organizer, unique } = await setup();
    const player = await makePlayer(org.id, "Dan");
    const { token } = await createPlayerInvite(org.id, player.id, organizer.id, `dan-${unique}@example.com`);
    await acceptPlayerInvite(token, "hunter2!");

    const count = await revokePlayerAccount(org.id, player.id);
    expect(count).toBe(1);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.passwordHash).toBeNull();
    expect(after.email).toBeNull();
    expect(after.authVersion).toBe(1);
    // Wrong org can't revoke.
    expect(await revokePlayerAccount("some-other-org", player.id)).toBe(0);
  });

  describe("submitPlayerResult", () => {
    async function activeMatch(opts?: { team?: boolean }) {
      const { org, tournament, unique } = await setup();
      const p1 = await makePlayer(org.id, "P1");
      const p2 = await makePlayer(org.id, "P2");
      const outsider = await makePlayer(org.id, "Outsider");
      const pod = await prisma.pod.create({
        data: {
          tournamentId: tournament.id,
          name: "Pod",
          format: "DRAFT",
          sequenceOrder: 0,
          matchFormat: "BO3",
          isTeamEvent: !!opts?.team,
          teamSize: opts?.team ? 1 : null,
        },
      });

      let entrantAId: string;
      if (opts?.team) {
        const teamA = await prisma.team.create({
          data: { podId: pod.id, name: "Team A", members: { create: { playerId: p1.id } } },
        });
        entrantAId = (await prisma.entrant.create({ data: { podId: pod.id, teamId: teamA.id } })).id;
      } else {
        entrantAId = (await prisma.entrant.create({ data: { podId: pod.id, playerId: p1.id } })).id;
      }
      const entrantB = await prisma.entrant.create({ data: { podId: pod.id, playerId: p2.id } });
      const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "ACTIVE" } });
      const match = await prisma.match.create({
        data: { roundId: round.id, tableNumber: 1, entrantAId, entrantBId: entrantB.id },
      });
      return { org, pod, round, match, p1, p2, outsider, unique };
    }

    it("lets a participant report, deriving the result from the games", async () => {
      const { org, match, p1 } = await activeMatch();
      const { match: updated } = await submitPlayerResult(match.id, org.id, p1.id, 2, 1);
      expect(updated.result).toBe("A_WINS");
      expect(updated.gamesWonA).toBe(2);
      expect(updated.reportedAt).not.toBeNull();
    });

    it("lets a team member report for their team's match", async () => {
      const { org, match, p1 } = await activeMatch({ team: true });
      const { match: updated } = await submitPlayerResult(match.id, org.id, p1.id, 0, 2);
      expect(updated.result).toBe("B_WINS");
    });

    it("rejects a non-participant", async () => {
      const { org, match, outsider } = await activeMatch();
      await expect(submitPlayerResult(match.id, org.id, outsider.id, 2, 0)).rejects.toMatchObject({
        code: "not_your_match",
      });
    });

    it("rejects reporting when the round isn't ACTIVE", async () => {
      const { org, round, match, p1 } = await activeMatch();
      await prisma.round.update({ where: { id: round.id }, data: { status: "PENDING" } });
      await expect(submitPlayerResult(match.id, org.id, p1.id, 2, 0)).rejects.toMatchObject({
        code: "round_not_active",
      });
    });

    it("clamps games to the pod's match format", async () => {
      const { org, pod, match, p1 } = await activeMatch();
      await prisma.pod.update({ where: { id: pod.id }, data: { matchFormat: "BO1" } });
      const { match: updated } = await submitPlayerResult(match.id, org.id, p1.id, 5, 0);
      expect(updated.gamesWonA).toBe(1);
      expect(updated.result).toBe("A_WINS");
    });
  });
});
