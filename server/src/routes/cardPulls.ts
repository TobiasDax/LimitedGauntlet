import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedPod, findOwnedTournament, findOwnedCardPull } from "../services/ownership.js";
import { autocompleteCardNames, lookupCardByName, lookupCardByCollectorNumber, listMainSets } from "../services/scryfall.js";
import { inferCardPullAttribution } from "../services/cardPullInference.js";

const idParams = z.object({ id: z.string().min(1) });

const autocompleteQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });
const cardQuerySchema = z.object({ name: z.string().trim().min(1).max(200) });

const setCodeSchema = z.string().trim().toLowerCase().min(2).max(10);
const collectorNumberSchema = z.string().trim().min(1).max(20);

// Either a card name (fuzzy-matched, optionally pinned to a set) or a
// collector number (pinned to an exact set+number printing) — the latter
// is the only way to pick between two printings that share both name and
// set, e.g. a showcase/borderless variant Scryfall's fuzzy name search
// can't otherwise disambiguate. Collector number requires setCode since a
// number alone means nothing without knowing which set it's from.
const addPullSchema = z
  .object({
    cardName: z.string().trim().max(200).optional(),
    collectorNumber: collectorNumberSchema.optional(),
    playerId: z.string().min(1).optional(),
    setCode: setCodeSchema.optional(),
    foil: z.boolean().default(false),
  })
  .refine((v) => (v.collectorNumber ? !!v.setCode : !!v.cardName?.trim()), {
    message: "cardName is required unless collectorNumber+setCode are given",
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

  // "Main" paper expansion/core sets, newest first — populates the pod
  // set-picker (see Pod.setCode). Cached a full day server-side, this list
  // barely changes.
  app.get("/api/scryfall/sets", async (_request, reply) => {
    const sets = await listMainSets();
    reply.send({ sets });
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

    const card = body.data.collectorNumber
      ? await lookupCardByCollectorNumber(body.data.setCode!, body.data.collectorNumber, { foil: body.data.foil })
      : await lookupCardByName(body.data.cardName!, { setCode: body.data.setCode, foil: body.data.foil });
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
        foil: card.foil,
        priceEur: card.priceEur,
        imageUri: card.imageUri,
      },
    });

    // A pull added to an already-completed pod can itself be inferrable
    // right away (e.g. logging pulls after the fact) — re-fetch so the
    // response reflects a possible inferred attribution, not the
    // pre-inference row.
    await inferCardPullAttribution(pod.id);
    const finalPull = await prisma.cardPull.findUniqueOrThrow({ where: { id: pull.id } });

    reply.code(201).send({ cardPull: toPlainPull(finalPull) });
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

  // Two independent things a pull can be corrected on, either together or
  // separately in one call:
  // - playerId: confirms an inferred guess as-is (pass the same id back)
  //   or reassigns to someone else — either way always marks it
  //   human-confirmed so inference never overwrites it again.
  // - setCode/foil/collectorNumber: re-resolves the pull against Scryfall
  //   for a specific printing, overwriting scryfallId/setCode/priceEur/
  //   foil/imageUri in place — fixes a wrong-set pull (e.g. a card
  //   silently resolved to an unrelated reprint) without losing
  //   playerId/playerIdInferred/addedAt the way a delete-and-recreate
  //   would. collectorNumber pins an exact printing by set+number (falls
  //   back to the pull's existing setCode if a new one isn't given in the
  //   same call) — the only way to fix a pull that resolved to the wrong
  //   one of two printings sharing both name and set.
  app.patch("/api/card-pulls/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = z
      .object({
        playerId: z.string().min(1).nullable().optional(),
        setCode: setCodeSchema.optional(),
        collectorNumber: collectorNumberSchema.optional(),
        foil: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const pull = await findOwnedCardPull(params.data.id, request.organizer!.orgId);
    if (!pull) {
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

    const data: Prisma.CardPullUncheckedUpdateInput = {};
    if (body.data.playerId !== undefined) {
      data.playerId = body.data.playerId;
      data.playerIdInferred = false;
    }

    if (body.data.setCode !== undefined || body.data.foil !== undefined || body.data.collectorNumber !== undefined) {
      const card = body.data.collectorNumber
        ? await lookupCardByCollectorNumber(body.data.setCode ?? pull.setCode ?? "", body.data.collectorNumber, {
            foil: body.data.foil ?? pull.foil,
          })
        : await lookupCardByName(pull.cardName, {
            setCode: body.data.setCode,
            foil: body.data.foil ?? pull.foil,
          });
      if (!card) {
        // Don't clobber a working pull with a failed re-resolution —
        // the name/setCode combination genuinely doesn't exist on
        // Scryfall, report it rather than silently leaving stale data
        // or guessing a different printing.
        reply.code(404).send({ error: "card_not_found" });
        return;
      }
      data.scryfallId = card.scryfallId;
      data.setCode = card.setCode;
      data.foil = card.foil;
      data.priceEur = card.priceEur;
      data.imageUri = card.imageUri;
    }

    const updated = await prisma.cardPull.update({ where: { id: pull.id }, data });
    reply.send({ cardPull: toPlainPull(updated) });
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
