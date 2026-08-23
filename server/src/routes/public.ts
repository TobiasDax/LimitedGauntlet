import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { findPublicTournament, findPublicPod } from "../services/ownership.js";
import { computeGesamtwertung } from "../services/gesamtwertung.js";
import { computePodStandings } from "../services/standings.js";

const tournamentParams = z.object({ slug: z.string().min(1), id: z.string().min(1) });
const podParams = z.object({ slug: z.string().min(1), id: z.string().min(1) });

function toPlainPull(pull: { priceEur: unknown; [k: string]: unknown }) {
  return { ...pull, priceEur: pull.priceEur === null ? null : Number(pull.priceEur) };
}

// The unauthenticated read-only surface: shareable links replacing the
// old Outline docs. An unguessable id plus a public org slug is the
// access control here, same trust model as the rest of the app's public
// pages — there is no mutation route in this file, on purpose.
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/public/o/:slug/tournaments/:id", async (request, reply) => {
    const params = tournamentParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const tournament = await findPublicTournament(params.data.slug, params.data.id);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const [pods, players, organization] = await Promise.all([
      prisma.pod.findMany({ where: { tournamentId: tournament.id }, orderBy: { sequenceOrder: "asc" } }),
      prisma.tournamentPlayer.findMany({ where: { tournamentId: tournament.id }, include: { player: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: tournament.orgId } }),
    ]);

    reply.send({
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      tournament: { ...tournament, pods, players },
    });
  });

  app.get("/api/public/o/:slug/tournaments/:id/gesamtwertung", async (request, reply) => {
    const params = tournamentParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const tournament = await findPublicTournament(params.data.slug, params.data.id);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const { pods, rows } = await computeGesamtwertung(tournament.id);
    const players = await prisma.player.findMany({ where: { id: { in: rows.map((r) => r.playerId) } } });
    const playerById = new Map(players.map((p) => [p.id, p]));
    const gesamtwertung = rows.map((row) => ({ ...row, player: playerById.get(row.playerId) }));
    reply.send({ pods, gesamtwertung });
  });

  app.get("/api/public/o/:slug/tournaments/:id/card-pulls", async (request, reply) => {
    const params = tournamentParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const tournament = await findPublicTournament(params.data.slug, params.data.id);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const pulls = await prisma.cardPull.findMany({
      where: { pod: { tournamentId: tournament.id } },
      include: { player: true, pod: { select: { id: true, name: true } } },
      orderBy: { priceEur: "desc" },
    });
    const plain = pulls.map(toPlainPull);
    const total = plain.reduce((sum, p) => sum + (p.priceEur ?? 0), 0);
    reply.send({ cardPulls: plain, total });
  });

  app.get("/api/public/o/:slug/pods/:id", async (request, reply) => {
    const params = podParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const pod = await findPublicPod(params.data.slug, params.data.id);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const entrants = await prisma.entrant.findMany({
      where: { podId: pod.id },
      include: { player: true, team: { include: { members: { include: { player: true } } } } },
    });
    reply.send({ pod: { ...pod, entrants } });
  });

  app.get("/api/public/o/:slug/pods/:id/rounds", async (request, reply) => {
    const params = podParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const pod = await findPublicPod(params.data.slug, params.data.id);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const rounds = await prisma.round.findMany({
      where: { podId: pod.id },
      orderBy: { roundNumber: "asc" },
      include: { matches: { orderBy: { tableNumber: "asc" } } },
    });
    reply.send({ rounds });
  });

  app.get("/api/public/o/:slug/pods/:id/standings", async (request, reply) => {
    const params = podParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const pod = await findPublicPod(params.data.slug, params.data.id);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const [rows, entrants] = await Promise.all([
      computePodStandings(pod.id),
      prisma.entrant.findMany({
        where: { podId: pod.id },
        include: { player: true, team: { include: { members: { include: { player: true } } } } },
      }),
    ]);
    const entrantById = new Map(entrants.map((e) => [e.id, e]));
    const standings = rows.map((row) => ({ ...row, entrant: entrantById.get(row.entrantId) }));
    reply.send({ standings });
  });

  app.get("/api/public/o/:slug/pods/:id/card-pulls", async (request, reply) => {
    const params = podParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const pod = await findPublicPod(params.data.slug, params.data.id);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const pulls = await prisma.cardPull.findMany({
      where: { podId: pod.id },
      include: { player: true },
      orderBy: { priceEur: "desc" },
    });
    const plain = pulls.map(toPlainPull);
    const total = plain.reduce((sum, p) => sum + (p.priceEur ?? 0), 0);
    reply.send({ cardPulls: plain, total });
  });
}
