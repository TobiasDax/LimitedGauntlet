import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedPod, findOwnedTournament, findOwnedCardPull } from "../services/ownership.js";
import { autocompleteCardNames, lookupCardByName } from "../services/scryfall.js";

const idParams = z.object({ id: z.string().min(1) });

const autocompleteQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });
const cardQuerySchema = z.object({ name: z.string().trim().min(1).max(200) });

const addPullSchema = z.object({
  cardName: z.string().trim().min(1).max(200),
  playerId: z.string().min(1).optional(),
});

function toPlainPull(pull: { priceEur: unknown; [k: string]: unknown }) {
  return { ...pull, priceEur: pull.priceEur === null ? null : Number(pull.priceEur) };
}

export async function cardPullRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/scryfall/autocomplete", async (request, reply) => {
    const query = autocompleteQuerySchema.safeParse(request.query);
    if (!query.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const names = await autocompleteCardNames(query.data.q);
    reply.send({ names });
  });

  app.get("/api/scryfall/card", async (request, reply) => {
    const query = cardQuerySchema.safeParse(request.query);
    if (!query.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const card = await lookupCardByName(query.data.name);
    if (!card) {
      reply.code(404).send({ error: "card_not_found" });
      return;
    }
    reply.send({ card });
  });

  app.post("/api/pods/:id/card-pulls", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = addPullSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input", issues: body.success ? undefined : body.error.issues });
      return;
    }

    const pod = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    if (body.data.playerId) {
      const player = await prisma.player.findFirst({
        where: { id: body.data.playerId, orgId: request.organizer!.orgId },
      });
      if (!player) {
        reply.code(404).send({ error: "player_not_found" });
        return;
      }
    }

    const card = await lookupCardByName(body.data.cardName);
    if (!card) {
      reply.code(404).send({ error: "card_not_found" });
      return;
    }

    const pull = await prisma.cardPull.create({
      data: {
        podId: pod.id,
        playerId: body.data.playerId ?? null,
        cardName: card.name,
        scryfallId: card.scryfallId,
        setCode: card.setCode,
        priceEur: card.priceEur,
        imageUri: card.imageUri,
      },
    });

    reply.code(201).send({ cardPull: toPlainPull(pull) });
  });

  app.get("/api/pods/:id/card-pulls", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const pod = await findOwnedPod(params.data.id, request.organizer!.orgId);
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

  app.delete("/api/card-pulls/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const pull = await findOwnedCardPull(params.data.id, request.organizer!.orgId);
    if (!pull) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    await prisma.cardPull.delete({ where: { id: pull.id } });
    reply.code(204).send();
  });

  // "Best Pulls of the Weekend" — every card pulled across every pod in
  // one tournament.
  app.get("/api/tournaments/:id/card-pulls", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
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

  // All-time, across every tournament this org has ever run — the
  // "Treasure Chest" page (the org-wide most-valuable-cards gallery).
  app.get("/api/card-pulls/treasure-chest", async (request, reply) => {
    const pulls = await prisma.cardPull.findMany({
      where: { pod: { excludeFromStats: false, tournament: { orgId: request.organizer!.orgId } } },
      include: {
        player: true,
        pod: { select: { id: true, name: true, tournament: { select: { id: true, name: true } } } },
      },
      orderBy: { priceEur: "desc" },
      take: 25,
    });

    reply.send({ cardPulls: pulls.map(toPlainPull) });
  });
}
