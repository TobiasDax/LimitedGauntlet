import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireSessionAuth } from "../auth/middleware.js";
import { requirePlayerAuth } from "../auth/playerMiddleware.js";
import { isEmailConfigured, resolveBaseUrl, sendMail } from "../services/mailer.js";
import { emitPodEvent, emitTournamentEvent } from "../realtime.js";
import { inferCardPullAttribution } from "../services/cardPullInference.js";
import { getPlayerTokenLedger, isTokensEnabled, syncPodTokenAwards } from "../services/tokens.js";
import {
  acceptPlayerInvite,
  authenticatePlayer,
  createPlayerInvite,
  getPlayerInvite,
  isPlayerAccountFailure,
  revokePlayerAccount,
  submitPlayerResult,
} from "../services/playerAccounts.js";

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const idParams = z.object({ id: z.string().min(1) });
const tokenParams = z.object({ token: z.string().min(1) });
const acceptSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) });
const loginSchema = z.object({
  orgSlug: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
const resultSchema = z.object({
  gamesWonA: z.number().int().min(0).max(10),
  gamesWonB: z.number().int().min(0).max(10),
});

function establishPlayerSession(request: FastifyRequest, player: { id: string; authVersion: number }): void {
  request.session.set("playerId", player.id);
  request.session.set("playerAuthVersion", player.authVersion);
}

function requestOrigin(request: FastifyRequest): string {
  const host = request.headers.host;
  return host ? `${request.protocol}://${String(host)}` : "";
}

function entrantName(entrant: { player: { displayName: string } | null; team: { name: string } | null } | null): string {
  if (!entrant) return "Bye";
  return entrant.player?.displayName ?? entrant.team?.name ?? "—";
}

export async function playerAccountRoutes(app: FastifyInstance): Promise<void> {
  // ---- Organizer-managed: invite a roster player, or revoke an account ----

  app.post("/api/players/:id/invite", { preHandler: requireSessionAuth }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = emailSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    try {
      const { token, playerName } = await createPlayerInvite(
        request.organizer!.orgId,
        params.data.id,
        request.organizer!.id,
        body.data.email,
      );
      const acceptUrl = `${resolveBaseUrl(requestOrigin(request))}/player/accept-invite?token=${encodeURIComponent(token)}`;
      let emailSent = false;
      if (isEmailConfigured()) {
        try {
          await sendMail({
            to: body.data.email,
            subject: "Your LimitedGauntlet player login",
            text: `You've been invited to a player account for ${playerName}. Set your password within 7 days: ${acceptUrl}`,
          });
          emailSent = true;
        } catch {
          emailSent = false;
        }
      }
      reply.code(201).send({ acceptUrl, emailSent });
    } catch (err) {
      if (isPlayerAccountFailure(err)) {
        reply.code(err.code === "not_found" ? 404 : 409).send({ error: err.code });
        return;
      }
      throw err;
    }
  });

  app.delete("/api/players/:id/account", { preHandler: requireSessionAuth }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const count = await revokePlayerAccount(request.organizer!.orgId, params.data.id);
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.code(204).send();
  });

  // ---- Public: accept an invite / log in / who am I ----

  app.get("/api/player/invite/:token", async (request, reply) => {
    const params = tokenParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const invite = await getPlayerInvite(params.data.token);
    if (!invite) {
      reply.code(404).send({ error: "invalid_or_expired" });
      return;
    }
    reply.send({
      email: invite.email,
      playerName: invite.player.displayName,
      organizationName: invite.organization.name,
      orgSlug: invite.organization.slug,
    });
  });

  app.post(
    "/api/player/accept-invite",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = acceptSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input", issues: body.error.issues });
        return;
      }
      try {
        const { player, organization } = await acceptPlayerInvite(body.data.token, body.data.password);
        establishPlayerSession(request, player);
        reply.code(201).send({
          player: { id: player.id, displayName: player.displayName },
          organization: { slug: organization.slug, name: organization.name },
        });
      } catch (err) {
        if (isPlayerAccountFailure(err)) {
          reply.code(err.code === "email_taken" ? 409 : 400).send({ error: err.code });
          return;
        }
        throw err;
      }
    },
  );

  app.post(
    "/api/player/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const result = await authenticatePlayer(parsed.data.orgSlug, parsed.data.email, parsed.data.password);
      if (!result) {
        reply.code(401).send({ error: "invalid_credentials" });
        return;
      }
      establishPlayerSession(request, result.player);
      reply.send({
        player: { id: result.player.id, displayName: result.player.displayName },
        organization: { slug: result.organization.slug, name: result.organization.name },
      });
    },
  );

  app.post("/api/player/logout", async (request, reply) => {
    request.session.set("playerId", undefined);
    request.session.set("playerAuthVersion", undefined);
    reply.code(204).send();
  });

  // The logged-in player's own token balance + ledger (PI-72). 404 when the
  // org has tokens off — the portal then hides the section.
  app.get("/api/player/tokens", { preHandler: requirePlayerAuth }, async (request, reply) => {
    const player = request.player!;
    if (!(await isTokensEnabled(player.orgId))) {
      reply.code(404).send({ error: "tokens_disabled" });
      return;
    }
    reply.send(await getPlayerTokenLedger(player.orgId, player.id));
  });

  app.get("/api/player/me", { preHandler: requirePlayerAuth }, async (request, reply) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: request.player!.orgId },
      select: { slug: true, name: true },
    });
    reply.send({
      player: { id: request.player!.id, displayName: request.player!.displayName },
      organization,
    });
  });

  // ---- Player portal: check in/out, report own results ----

  app.get("/api/player/portal", { preHandler: requirePlayerAuth }, async (request, reply) => {
    const player = request.player!;

    const [tournaments, checkIns, myEntrants, activeMatches] = await Promise.all([
      prisma.tournament.findMany({
        where: { orgId: player.orgId },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, startDate: true, endDate: true, status: true },
      }),
      prisma.tournamentPlayer.findMany({ where: { playerId: player.id }, select: { tournamentId: true } }),
      prisma.entrant.findMany({
        where: {
          pod: { tournament: { orgId: player.orgId } },
          OR: [{ playerId: player.id }, { team: { members: { some: { playerId: player.id } } } }],
        },
        select: { id: true },
      }),
      prisma.match.findMany({
        where: {
          entrantBId: { not: null },
          round: { status: "ACTIVE", pod: { tournament: { orgId: player.orgId } } },
          OR: [
            { entrantA: { playerId: player.id } },
            { entrantB: { playerId: player.id } },
            { entrantA: { team: { members: { some: { playerId: player.id } } } } },
            { entrantB: { team: { members: { some: { playerId: player.id } } } } },
          ],
        },
        include: {
          entrantA: { include: { player: { select: { displayName: true } }, team: { select: { name: true } } } },
          entrantB: { include: { player: { select: { displayName: true } }, team: { select: { name: true } } } },
          round: {
            select: {
              roundNumber: true,
              pod: { select: { id: true, name: true, matchFormat: true, tournamentId: true } },
            },
          },
        },
      }),
    ]);

    const checkedInIds = new Set(checkIns.map((c) => c.tournamentId));
    const myEntrantIds = new Set(myEntrants.map((e) => e.id));

    const matches = activeMatches.map((m) => {
      const mySide: "A" | "B" = myEntrantIds.has(m.entrantAId) ? "A" : "B";
      return {
        matchId: m.id,
        podId: m.round.pod.id,
        podName: m.round.pod.name,
        tournamentId: m.round.pod.tournamentId,
        roundNumber: m.round.roundNumber,
        matchFormat: m.round.pod.matchFormat,
        mySide,
        opponentName: entrantName(mySide === "A" ? m.entrantB : m.entrantA),
        gamesWonA: m.gamesWonA,
        gamesWonB: m.gamesWonB,
        result: m.result,
      };
    });

    reply.send({
      tournaments: tournaments.map((t) => ({ ...t, checkedIn: checkedInIds.has(t.id) })),
      matches,
    });
  });

  const tournamentIdParams = z.object({ id: z.string().min(1) });

  app.post("/api/player/tournaments/:id/check-in", { preHandler: requirePlayerAuth }, async (request, reply) => {
    const params = tournamentIdParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const player = request.player!;
    const tournament = await prisma.tournament.findFirst({ where: { id: params.data.id, orgId: player.orgId } });
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    await prisma.tournamentPlayer.upsert({
      where: { tournamentId_playerId: { tournamentId: tournament.id, playerId: player.id } },
      create: { tournamentId: tournament.id, playerId: player.id },
      update: {},
    });
    emitTournamentEvent(tournament.id, "roster-changed", { tournamentId: tournament.id });
    reply.code(204).send();
  });

  app.delete("/api/player/tournaments/:id/check-in", { preHandler: requirePlayerAuth }, async (request, reply) => {
    const params = tournamentIdParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const player = request.player!;
    const tournament = await prisma.tournament.findFirst({ where: { id: params.data.id, orgId: player.orgId } });
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    // Don't strand a pairing: once the organizer has entered this player into a
    // pod, only the organizer can pull them back out.
    const entered = await prisma.entrant.findFirst({
      where: {
        pod: { tournamentId: tournament.id },
        OR: [{ playerId: player.id }, { team: { members: { some: { playerId: player.id } } } }],
      },
      select: { id: true },
    });
    if (entered) {
      reply.code(409).send({ error: "already_entered" });
      return;
    }
    await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: tournament.id, playerId: player.id } });
    emitTournamentEvent(tournament.id, "roster-changed", { tournamentId: tournament.id });
    reply.code(204).send();
  });

  app.patch("/api/player/matches/:id/result", { preHandler: requirePlayerAuth }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = resultSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    try {
      const { match, podId, tournamentId } = await submitPlayerResult(
        params.data.id,
        request.player!.orgId,
        request.player!.id,
        body.data.gamesWonA,
        body.data.gamesWonB,
      );
      emitPodEvent(podId, "result-submitted", { match });
      emitTournamentEvent(tournamentId, "standings-changed", { podId });
      await inferCardPullAttribution(podId);
      await syncPodTokenAwards(podId);
      reply.send({ match });
    } catch (err) {
      if (isPlayerAccountFailure(err)) {
        reply
          .code(err.code === "not_found" ? 404 : err.code === "not_your_match" ? 403 : 400)
          .send({ error: err.code });
        return;
      }
      throw err;
    }
  });
}
