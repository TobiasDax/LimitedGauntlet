import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedPod, findOwnedRound, findOwnedMatch } from "../services/ownership.js";
import { generatePairings, getActiveEntrants, PairingError } from "../services/pairing.js";
import { inferCardPullAttribution } from "../services/cardPullInference.js";
import { emitPodEvent, emitTournamentEvent } from "../realtime.js";

const idParams = z.object({ id: z.string().min(1) });

const extendSchema = z.object({
  minutes: z.number().int().min(1).max(60),
});

const manualPairSchema = z.object({
  pairs: z
    .array(
      z.object({
        entrantAId: z.string().min(1),
        entrantBId: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});

const swapSchema = z.object({
  matchAId: z.string().min(1),
  sideA: z.enum(["A", "B"]),
  matchBId: z.string().min(1),
  sideB: z.enum(["A", "B"]),
});

const resultSchema = z.object({
  result: z.enum(["A_WINS", "B_WINS", "DRAW"]),
  gamesWonA: z.number().int().min(0),
  gamesWonB: z.number().int().min(0),
  gamesDrawn: z.number().int().min(0).default(0),
});

async function checkNextRoundAllowed(
  pod: { id: string; roundCount: number },
): Promise<{ nextRoundNumber: number } | { error: string }> {
  const [last] = await prisma.round.findMany({
    where: { podId: pod.id },
    orderBy: { roundNumber: "desc" },
    take: 1,
  });
  const nextRoundNumber = (last?.roundNumber ?? 0) + 1;
  if (nextRoundNumber > pod.roundCount) return { error: "round_count_exceeded" };
  if (last && last.status !== "COMPLETED") return { error: "previous_round_not_completed" };
  return { nextRoundNumber };
}

export async function roundRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/pods/:id/rounds", async (request, reply) => {
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
    const rounds = await prisma.round.findMany({
      where: { podId: pod.id },
      orderBy: { roundNumber: "asc" },
      include: { matches: { orderBy: { tableNumber: "asc" } } },
    });
    reply.send({ rounds });
  });

  app.post("/api/pods/:id/rounds", async (request, reply) => {
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

    const precheck = await checkNextRoundAllowed(pod);
    if ("error" in precheck) {
      reply.code(400).send(precheck);
      return;
    }
    const { nextRoundNumber } = precheck;

    let suggestion;
    try {
      suggestion = await generatePairings(pod.id, nextRoundNumber);
    } catch (err) {
      if (err instanceof PairingError) {
        reply.code(409).send({ error: "pairing_failed", message: err.message });
        return;
      }
      throw err;
    }

    const round = await prisma.$transaction(async (tx) => {
      const created = await tx.round.create({ data: { podId: pod.id, roundNumber: nextRoundNumber } });
      await tx.match.createMany({
        data: suggestion.pairs.map((pair, index) => ({
          roundId: created.id,
          tableNumber: index + 1,
          entrantAId: pair.entrantAId,
          entrantBId: pair.entrantBId,
        })),
      });
      return tx.round.findUniqueOrThrow({ where: { id: created.id }, include: { matches: true } });
    });

    emitPodEvent(pod.id, "pairings-published", { round });
    reply.code(201).send({ round });
  });

  app.post("/api/pods/:id/rounds/manual", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = manualPairSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input", issues: body.success ? undefined : body.error.issues });
      return;
    }

    const pod = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const precheck = await checkNextRoundAllowed(pod);
    if ("error" in precheck) {
      reply.code(400).send(precheck);
      return;
    }
    const { nextRoundNumber } = precheck;

    const activeEntrants = await getActiveEntrants(pod.id, nextRoundNumber);
    const activeIds = new Set(activeEntrants.map((e) => e.id));

    const usedIds: string[] = [];
    let byeCount = 0;
    for (const pair of body.data.pairs) {
      usedIds.push(pair.entrantAId);
      if (pair.entrantBId === null) byeCount++;
      else usedIds.push(pair.entrantBId);
    }

    const usedSet = new Set(usedIds);
    const unknown = usedIds.filter((id) => !activeIds.has(id));
    const missing = [...activeIds].filter((id) => !usedSet.has(id));
    const hasDuplicates = usedIds.length !== usedSet.size;
    const expectedByes = activeIds.size % 2 === 1 ? 1 : 0;

    if (unknown.length > 0 || hasDuplicates || missing.length > 0 || byeCount !== expectedByes) {
      reply.code(400).send({ error: "invalid_pairing", unknown, hasDuplicates, missing, byeCount, expectedByes });
      return;
    }

    const round = await prisma.$transaction(async (tx) => {
      const created = await tx.round.create({ data: { podId: pod.id, roundNumber: nextRoundNumber } });
      await tx.match.createMany({
        data: body.data.pairs.map((pair, index) => ({
          roundId: created.id,
          tableNumber: index + 1,
          entrantAId: pair.entrantAId,
          entrantBId: pair.entrantBId,
        })),
      });
      return tx.round.findUniqueOrThrow({ where: { id: created.id }, include: { matches: true } });
    });

    emitPodEvent(pod.id, "pairings-published", { round });
    reply.code(201).send({ round });
  });

  app.post("/api/rounds/:id/swap", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = swapSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const round = await findOwnedRound(params.data.id, request.organizer!.orgId);
    if (!round) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (round.status !== "PENDING") {
      reply.code(400).send({ error: "round_locked" });
      return;
    }

    const [matchA, matchB] = await Promise.all([
      prisma.match.findFirst({ where: { id: body.data.matchAId, roundId: round.id } }),
      prisma.match.findFirst({ where: { id: body.data.matchBId, roundId: round.id } }),
    ]);
    if (!matchA || !matchB) {
      reply.code(404).send({ error: "match_not_found" });
      return;
    }

    const fieldA = body.data.sideA === "A" ? "entrantAId" : "entrantBId";
    const fieldB = body.data.sideB === "A" ? "entrantAId" : "entrantBId";
    const valueA = matchA[fieldA];
    const valueB = matchB[fieldB];
    if (!valueA || !valueB) {
      reply.code(400).send({ error: "cannot_swap_bye" });
      return;
    }
    if (matchA.id === matchB.id && fieldA === fieldB) {
      reply.code(400).send({ error: "no_op" });
      return;
    }

    await prisma.$transaction([
      prisma.match.update({ where: { id: matchA.id }, data: { [fieldA]: valueB } }),
      prisma.match.update({ where: { id: matchB.id }, data: { [fieldB]: valueA } }),
    ]);

    emitPodEvent(round.podId, "pairings-updated", { roundId: round.id });
    reply.send({ ok: true });
  });

  app.post("/api/rounds/:id/start", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const round = await findOwnedRound(params.data.id, request.organizer!.orgId);
    if (!round) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (round.status !== "PENDING") {
      reply.code(400).send({ error: "already_started" });
      return;
    }

    const pod = await prisma.pod.findUniqueOrThrow({ where: { id: round.podId } });
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + pod.roundLengthMinutes * 60_000);

    const updated = await prisma.round.update({
      where: { id: round.id },
      data: { status: "ACTIVE", startedAt, endsAt },
    });
    emitPodEvent(round.podId, "round-started", { roundId: round.id, startedAt, endsAt });
    reply.send({ round: updated });
  });

  app.post("/api/rounds/:id/extend", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = extendSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const round = await findOwnedRound(params.data.id, request.organizer!.orgId);
    if (!round) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (round.status !== "ACTIVE" || !round.endsAt) {
      reply.code(400).send({ error: "round_not_active" });
      return;
    }

    const endsAt = new Date(round.endsAt.getTime() + body.data.minutes * 60_000);
    const updated = await prisma.round.update({ where: { id: round.id }, data: { endsAt } });
    emitPodEvent(round.podId, "round-extended", { roundId: round.id, endsAt });
    reply.send({ round: updated });
  });

  app.post("/api/rounds/:id/complete", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const round = await findOwnedRound(params.data.id, request.organizer!.orgId);
    if (!round) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (round.status !== "ACTIVE") {
      reply.code(400).send({ error: "round_not_active" });
      return;
    }

    const matches = await prisma.match.findMany({ where: { roundId: round.id } });
    const unreported = matches.filter((m) => m.entrantBId !== null && m.result === "PENDING");
    if (unreported.length > 0) {
      reply.code(400).send({ error: "results_missing", matchIds: unreported.map((m) => m.id) });
      return;
    }

    const updated = await prisma.round.update({ where: { id: round.id }, data: { status: "COMPLETED" } });
    emitPodEvent(round.podId, "round-completed", { roundId: round.id });
    const completedPod = await prisma.pod.findUniqueOrThrow({ where: { id: round.podId }, select: { tournamentId: true } });
    emitTournamentEvent(completedPod.tournamentId, "standings-changed", { podId: round.podId });
    // The pod may have just become fully decided — see if any of its
    // card pulls can now be attributed.
    await inferCardPullAttribution(round.podId);
    reply.send({ round: updated });
  });

  app.patch("/api/matches/:id/result", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = resultSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const match = await findOwnedMatch(params.data.id, request.organizer!.orgId);
    if (!match) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (!match.entrantBId) {
      reply.code(400).send({ error: "bye_has_no_result" });
      return;
    }

    const round = await prisma.round.findUniqueOrThrow({ where: { id: match.roundId } });
    if (round.status !== "ACTIVE" && round.status !== "COMPLETED") {
      reply.code(400).send({ error: "round_not_active" });
      return;
    }

    const updated = await prisma.match.update({
      where: { id: match.id },
      data: { ...body.data, reportedAt: new Date() },
    });
    emitPodEvent(round.podId, "result-submitted", { match: updated });
    const resultPod = await prisma.pod.findUniqueOrThrow({ where: { id: round.podId }, select: { tournamentId: true } });
    emitTournamentEvent(resultPod.tournamentId, "standings-changed", { podId: round.podId });
    // A correction on a completed round can change who finished top-3 —
    // refresh any not-yet-confirmed inferred attributions to match.
    await inferCardPullAttribution(round.podId);
    reply.send({ match: updated });
  });
}
