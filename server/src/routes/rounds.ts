import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedPod, findOwnedRound, findOwnedMatch } from "../services/ownership.js";
import { generatePairings, getActiveEntrants, getLatestRound, PairingError } from "../services/pairing.js";
import { inferCardPullAttribution } from "../services/cardPullInference.js";
import { syncPodTokenAwards } from "../services/tokens.js";
import { emitPodEvent, emitTournamentEvent } from "../realtime.js";
import { sendWebhookEvent, buildMatchesPayload, buildStandingsPayload, fireAndForget } from "../services/webhooks.js";

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

// PI-78 — a player can drop mid-match now, not just between rounds: the
// organizer records whatever result was actually played, and separately
// says who (if anyone) dropped. "NONE" is the default so every existing
// caller (which never sent this field) behaves exactly as before.
const resultSchema = z.object({
  result: z.enum(["A_WINS", "B_WINS", "DRAW"]),
  gamesWonA: z.number().int().min(0),
  gamesWonB: z.number().int().min(0),
  gamesDrawn: z.number().int().min(0).default(0),
  dropped: z.enum(["NONE", "A", "B", "BOTH"]).default("NONE"),
});

async function checkNextRoundAllowed(
  pod: { id: string; roundCount: number },
): Promise<{ nextRoundNumber: number } | { error: string }> {
  const last = await getLatestRound(pod.id);
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
      // PI-82 — the real "pod actually started" moment, regardless of
      // format: round 1's Match rows being created (for DRAFT/CHAOS_DRAFT/
      // SEALED this is the same action as PI-80's "Generate seatings").
      if (nextRoundNumber === 1) {
        await tx.pod.update({ where: { id: pod.id }, data: { actualStartedAt: new Date() } });
      }
      return tx.round.findUniqueOrThrow({ where: { id: created.id }, include: { matches: true } });
    });

    emitPodEvent(pod.id, "pairings-published", { round });
    // PI-80 — round 1's pairings.posted webhook fires on reveal instead of
    // here (a webhook receiver, e.g. a Discord relay, is exactly the kind of
    // early-leak path the reveal gate exists to close). Every later round
    // isn't gated, so it fires immediately as before.
    if (round.roundNumber !== 1) {
      const orgId = request.organizer!.orgId;
      fireAndForget(async () => {
        const matches = await buildMatchesPayload(pod.id, round.id);
        await sendWebhookEvent(orgId, pod.id, "pairings.posted", { roundId: round.id, roundNumber: round.roundNumber, matches });
      });
    }
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
      // PI-82 — same "actually started" stamp as the auto-pairing route above.
      if (nextRoundNumber === 1) {
        await tx.pod.update({ where: { id: pod.id }, data: { actualStartedAt: new Date() } });
      }
      return tx.round.findUniqueOrThrow({ where: { id: created.id }, include: { matches: true } });
    });

    emitPodEvent(pod.id, "pairings-published", { round });
    // PI-80 — same round-1-defers-to-reveal rule as the auto-pairing route above.
    if (round.roundNumber !== 1) {
      const orgId = request.organizer!.orgId;
      fireAndForget(async () => {
        const matches = await buildMatchesPayload(pod.id, round.id);
        await sendWebhookEvent(orgId, pod.id, "pairings.posted", { roundId: round.id, roundNumber: round.roundNumber, matches });
      });
    }
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

  // Undo a round's pairing entirely (PI-56) — only while it's still
  // PENDING (not started). Deletes its Match rows and the Round itself,
  // returning the pod to its pre-pairing state so it can be re-paired
  // (generated or manual) from scratch. Mainly useful for round 1: the
  // draft seating chart only renders once round 1 is paired, but the
  // existing swap-only UI can't fully re-shuffle it — this gives a real
  // way back to the unpaired state instead of swapping seat by seat.
  app.delete("/api/rounds/:id", async (request, reply) => {
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
      reply.code(400).send({ error: "round_already_started" });
      return;
    }

    await prisma.match.deleteMany({ where: { roundId: round.id } });
    await prisma.round.delete({ where: { id: round.id } });

    // PI-82 — undoing round 1's pairing undoes the "actually started" stamp
    // too, since generation was what set it.
    if (round.roundNumber === 1) {
      await prisma.pod.update({ where: { id: round.podId }, data: { actualStartedAt: null } });
    }

    emitPodEvent(round.podId, "round-unpaired", { roundId: round.id });
    // Deleting an unplayed final round un-completes the pod — clear its auto
    // token awards (PI-72). No-op if the pod isn't/wasn't complete.
    await syncPodTokenAwards(round.podId);
    reply.code(204).send();
  });

  // PI-80 — reveal round 1's pairings. A deliberate, separate action from
  // both generating the round (which can happen well before this, purely to
  // produce a seating chart) and starting it (a separate action still, once
  // everyone's found their seat) — see the Round.pairingsRevealedAt schema
  // comment. Idempotent: revealing an already-revealed round is a no-op,
  // not an error, so a client can call this without checking state first.
  app.post("/api/rounds/:id/reveal-pairings", async (request, reply) => {
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
    if (round.roundNumber !== 1) {
      reply.code(400).send({ error: "only_round_one_needs_reveal" });
      return;
    }

    const alreadyRevealed = !!round.pairingsRevealedAt;
    const updated = alreadyRevealed
      ? round
      : await prisma.round.update({ where: { id: round.id }, data: { pairingsRevealedAt: new Date() } });

    emitPodEvent(round.podId, "pairings-revealed", { roundId: round.id });
    // The pairings.posted webhook (e.g. a Discord relay) deliberately didn't
    // fire back when round 1 was generated (PI-80) — this reveal is the
    // actual "pairings are now knowable" moment, so it fires here instead.
    // Only on the real transition, not a repeat call on an already-revealed round.
    if (!alreadyRevealed) {
      const orgId = request.organizer!.orgId;
      const podId = round.podId;
      fireAndForget(async () => {
        const matches = await buildMatchesPayload(podId, round.id);
        await sendWebhookEvent(orgId, podId, "pairings.posted", { roundId: round.id, roundNumber: round.roundNumber, matches });
      });
    }
    reply.send({ round: updated });
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

    // PI-54: the prep timer (draft/deckbuilding countdown, PI-33) only makes
    // sense before the pod's first round — once round 1 actually starts,
    // stop it automatically instead of leaving it counting down alongside
    // the round timer.
    if (round.roundNumber === 1 && pod.prepTimerEndsAt !== null) {
      await prisma.pod.update({ where: { id: pod.id }, data: { prepTimerEndsAt: null, prepTimerLabel: null } });
      emitPodEvent(round.podId, "prep-timer-updated", { podId: round.podId, prepTimerEndsAt: null, prepTimerLabel: null });
    }

    emitPodEvent(round.podId, "round-started", { roundId: round.id, startedAt, endsAt });
    {
      const orgId = request.organizer!.orgId;
      fireAndForget(async () => {
        // Included so a listener reacting only to round.started (e.g. an
        // AWTRIX/HA automation) knows who's playing without also having to
        // track the earlier pairings.posted event.
        const matches = await buildMatchesPayload(round.podId, round.id);
        await sendWebhookEvent(orgId, round.podId, "round.started", {
          roundId: round.id,
          roundNumber: round.roundNumber,
          startedAt,
          endsAt,
          matches,
        });
      });
    }
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
    void sendWebhookEvent(request.organizer!.orgId, round.podId, "round.extended", {
      roundId: round.id,
      roundNumber: round.roundNumber,
      endsAt,
    });
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
    const completedPod = await prisma.pod.findUniqueOrThrow({
      where: { id: round.podId },
      select: { tournamentId: true, roundCount: true },
    });
    {
      const orgId = request.organizer!.orgId;
      const isFinalRound = round.roundNumber >= completedPod.roundCount;
      fireAndForget(async () => {
        const standings = await buildStandingsPayload(round.podId);
        await sendWebhookEvent(orgId, round.podId, "round.completed", {
          roundId: round.id,
          roundNumber: round.roundNumber,
          isLastRound: isFinalRound,
          standings,
        });
        // The pod's last round just completed — this is the natural "pod is
        // fully decided" moment (there's no separate organizer action for
        // it; the app doesn't manage pod.status automatically). Reuses the
        // same standings, no extra query. Also carried as `isLastRound` on
        // round.completed above, so a receiver only listening to that one
        // event doesn't need to also handle pod.completed.
        if (isFinalRound) {
          await sendWebhookEvent(orgId, round.podId, "pod.completed", {
            roundNumber: round.roundNumber,
            winner: standings[0] ?? null,
            standings,
          });
        }
      });
    }
    emitTournamentEvent(completedPod.tournamentId, "standings-changed", { podId: round.podId });
    // The pod may have just become fully decided — see if any of its
    // card pulls can now be attributed.
    await inferCardPullAttribution(round.podId);
    await syncPodTokenAwards(round.podId);
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

    const { dropped, ...resultData } = body.data;
    const [updated] = await prisma.$transaction([
      prisma.match.update({
        where: { id: match.id },
        data: { ...resultData, reportedAt: new Date() },
      }),
      // Same field, same semantics PI-63 already established ("excluded
      // starting next round") — just settable during an ACTIVE round now,
      // via round.roundNumber, instead of only after the round COMPLETEs
      // via the standalone drop route's latest-round lookup.
      ...(dropped === "A" || dropped === "BOTH"
        ? [prisma.entrant.update({ where: { id: match.entrantAId }, data: { droppedAfterRound: round.roundNumber } })]
        : []),
      ...(dropped === "B" || dropped === "BOTH"
        ? [prisma.entrant.update({ where: { id: match.entrantBId }, data: { droppedAfterRound: round.roundNumber } })]
        : []),
    ]);
    emitPodEvent(round.podId, "result-submitted", { match: updated });
    const resultPod = await prisma.pod.findUniqueOrThrow({ where: { id: round.podId }, select: { tournamentId: true } });
    emitTournamentEvent(resultPod.tournamentId, "standings-changed", { podId: round.podId });
    // A correction on a completed round can change who finished top-3 —
    // refresh any not-yet-confirmed inferred attributions to match.
    await inferCardPullAttribution(round.podId);
    await syncPodTokenAwards(round.podId);
    reply.send({ match: updated });
  });
}
