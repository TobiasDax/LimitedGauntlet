import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { findPublicTournament, findPublicPod, findPublicOrganization } from "../services/ownership.js";
import { verifyPassword } from "../auth/password.js";
import { hasValidPlayerSession } from "../services/playerAccounts.js";
import { computeGesamtwertung, countTournamentParticipants } from "../services/gesamtwertung.js";
import { computePodStandings } from "../services/standings.js";
import { computeHallOfFameOverview, computePlayerStats, type HeadToHeadEntry } from "../services/playerStats.js";
import { computeSeatings } from "../services/seatings.js";
import { redactUnrevealedRound1 } from "../services/pairingsVisibility.js";
import { buildRedactor, type Redactor } from "../services/publicVisibility.js";
import { getHiddenPlayerIds } from "../services/playerPrivacy.js";

const tournamentParams = z.object({ slug: z.string().min(1), id: z.string().min(1) });
const podParams = z.object({ slug: z.string().min(1), id: z.string().min(1) });
const orgParams = z.object({ slug: z.string().min(1) });
const orgPlayerParams = z.object({ slug: z.string().min(1), playerId: z.string().min(1) });

function toPlainPull(pull: { priceEur: unknown; [k: string]: unknown }) {
  return { ...pull, priceEur: pull.priceEur === null ? null : Number(pull.priceEur) };
}

// PI-52/107 — the only Player fields the public surface ever needs. Strips the
// self-service login email + identity link and the internal privacy
// timestamps that a raw `include: { player: true }` would otherwise ship, and
// swaps the name for a placeholder when the player is hidden from public view
// (Art. 21). A missing player (null) passes through.
type RawPlayer = { id: string; orgId: string; displayName: string; createdAt: Date } & Record<string, unknown>;
function shapePublicPlayer<T extends RawPlayer | null | undefined>(
  player: T,
  redactor: Redactor,
): { id: string; orgId: string; displayName: string; createdAt: Date } | null {
  if (!player) return null;
  return {
    id: player.id,
    orgId: player.orgId,
    displayName: redactor.name(player.id, player.displayName),
    createdAt: player.createdAt,
  };
}

// An entrant as the public pod/standings routes include it: an individual
// player, or a team whose members each carry a player. Redacts every player
// name in place and strips the non-public player fields.
function redactEntrant<
  E extends {
    player: RawPlayer | null;
    team: { members: { player: RawPlayer }[] } | null;
  },
>(entrant: E, redactor: Redactor) {
  return {
    ...entrant,
    player: shapePublicPlayer(entrant.player, redactor),
    team: entrant.team
      ? {
          ...entrant.team,
          members: entrant.team.members.map((m) => ({ ...m, player: shapePublicPlayer(m.player, redactor) })),
        }
      : entrant.team,
  };
}

// Loaded once per public request. An org with no hidden players gets a
// no-op redactor.
async function publicRedactor(orgId: string): Promise<Redactor> {
  return buildRedactor(await getHiddenPlayerIds(orgId));
}

// Same, when the handler has a pod's tournamentId but not the orgId.
async function publicRedactorByTournament(tournamentId: string): Promise<Redactor> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { orgId: true } });
  return buildRedactor(t ? await getHiddenPlayerIds(t.orgId) : []);
}

// Which org ids this visitor has unlocked (PI-27), stored in the encrypted
// session cookie. A visitor with no session yet simply has none.
function getUnlockedOrgIds(request: FastifyRequest): string[] {
  const raw = request.session.get("publicUnlocked");
  return Array.isArray(raw) ? raw : [];
}

function isUnlocked(request: FastifyRequest, orgId: string): boolean {
  return getUnlockedOrgIds(request).includes(orgId);
}

// The unauthenticated read-only surface: shareable links replacing the
// old Outline docs. An unguessable id plus a public org slug is the
// access control here, same trust model as the rest of the app's public
// pages — there is no mutation route in this file, on purpose.
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // PI-27 — optional org-wide password lock. When an org sets a public
  // password, every /o/:slug/... data route below is gated behind it; a visitor
  // unlocks once (per browser session) via POST .../unlock. This hook runs for
  // every route in this (encapsulated) plugin — it does NOT affect the authed
  // routes, which live in their own contexts. The unlock + lock-status routes
  // are themselves exempt (else you couldn't unlock a locked org).
  app.addHook("preHandler", async (request, reply) => {
    const routeUrl = request.routeOptions.url ?? "";
    if (routeUrl.endsWith("/unlock") || routeUrl.endsWith("/lock")) return;
    const slug = (request.params as { slug?: string }).slug;
    if (!slug) return;
    const organization = await findPublicOrganization(slug);
    if (!organization || !organization.publicPasswordHash) return; // missing → 404 in handler; unlocked → open
    if (isUnlocked(request, organization.id)) return;
    // A logged-in player of this org has already authenticated to it (PI-52),
    // so the public-page password isn't a second gate for them — they read the
    // same public surface through these routes as the portal links to.
    if (await hasValidPlayerSession(request, organization.id)) return;
    reply.code(401).send({ error: "locked" });
  });

  // Whether this org's public pages are locked, and whether this visitor has
  // already unlocked them — lets the frontend show the prompt vs. the content
  // without first eating a 401 on the real data. Never gated.
  app.get("/api/public/o/:slug/lock", async (request, reply) => {
    const params = orgParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const organization = await findPublicOrganization(params.data.slug);
    if (!organization) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const locked = !!organization.publicPasswordHash;
    reply.send({ locked, unlocked: !locked || isUnlocked(request, organization.id) });
  });

  // Verify the public password and mark this org unlocked for the visitor's
  // session. Rate-limited like the login route to blunt brute-forcing.
  app.post(
    "/api/public/o/:slug/unlock",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = orgParams.safeParse(request.params);
      const body = z.object({ password: z.string().min(1) }).safeParse(request.body);
      if (!params.success || !body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const organization = await findPublicOrganization(params.data.slug);
      if (!organization) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      if (!organization.publicPasswordHash) {
        reply.send({ ok: true }); // not locked — nothing to unlock
        return;
      }
      const valid = await verifyPassword(organization.publicPasswordHash, body.data.password);
      if (!valid) {
        reply.code(401).send({ error: "invalid_password" });
        return;
      }
      const current = getUnlockedOrgIds(request);
      if (!current.includes(organization.id)) {
        request.session.set("publicUnlocked", [...current, organization.id]);
      }
      reply.send({ ok: true });
    },
  );

  // The org landing page — "send one link, browse everything the
  // organizer sees" needs a page at the bare /o/:slug root to land on,
  // same idea as the authed dashboard's tournament list.
  app.get("/api/public/o/:slug", async (request, reply) => {
    const params = orgParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const organization = await findPublicOrganization(params.data.slug);
    if (!organization) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const tournaments = await prisma.tournament.findMany({
      where: { orgId: organization.id },
      orderBy: { startDate: "desc" },
    });
    reply.send({
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      tournaments,
    });
  });

  app.get("/api/public/o/:slug/roster", async (request, reply) => {
    const params = orgParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const organization = await findPublicOrganization(params.data.slug);
    if (!organization) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const [players, redactor] = await Promise.all([
      prisma.player.findMany({ where: { orgId: organization.id }, orderBy: { displayName: "asc" } }),
      publicRedactor(organization.id),
    ]);
    reply.send({
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      players: players.map((p) => shapePublicPlayer(p, redactor)),
    });
  });

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

    const [podsWithEntrants, players, organization, redactor] = await Promise.all([
      prisma.pod.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { sequenceOrder: "asc" },
        include: {
          rounds: { select: { roundNumber: true, status: true }, orderBy: { roundNumber: "asc" } },
          entrants: { select: { playerId: true, team: { select: { members: { select: { playerId: true } } } } } },
        },
      }),
      prisma.tournamentPlayer.findMany({ where: { tournamentId: tournament.id }, include: { player: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: tournament.orgId } }),
      publicRedactor(tournament.orgId),
    ]);

    const playersPlayed = countTournamentParticipants(podsWithEntrants);
    const pods = podsWithEntrants.map(({ entrants, ...pod }) => ({ ...pod, entrantCount: entrants.length }));

    reply.send({
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      tournament: {
        ...tournament,
        pods,
        players: players.map((tp) => ({ ...tp, player: shapePublicPlayer(tp.player, redactor) })),
        playersPlayed,
      },
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
    const [players, redactor] = await Promise.all([
      prisma.player.findMany({ where: { id: { in: rows.map((r) => r.playerId) } } }),
      publicRedactor(tournament.orgId),
    ]);
    const playerById = new Map(players.map((p) => [p.id, p]));
    const gesamtwertung = rows.map((row) => ({
      ...row,
      player: shapePublicPlayer(playerById.get(row.playerId) ?? null, redactor),
    }));
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

    const [pulls, redactor] = await Promise.all([
      prisma.cardPull.findMany({
        // PI-66: exclude pods with rare-picks tracking turned off.
        where: { pod: { tournamentId: tournament.id, rarePicksEnabled: true } },
        include: { player: true, pod: { select: { id: true, name: true } } },
        orderBy: { priceEur: "desc" },
      }),
      publicRedactor(tournament.orgId),
    ]);
    const plain = pulls.map((p) => ({ ...toPlainPull(p), player: shapePublicPlayer(p.player, redactor) }));
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
    const [entrants, redactor] = await Promise.all([
      prisma.entrant.findMany({
        where: { podId: pod.id },
        include: { player: true, team: { include: { members: { include: { player: true } } } } },
      }),
      publicRedactorByTournament(pod.tournamentId),
    ]);
    reply.send({ pod: { ...pod, entrants: entrants.map((e) => redactEntrant(e, redactor)) } });
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
    // Matches are stripped server-side, not just hidden client-side — this
    // is the untrusted-device path (a player's own phone), so there's no
    // client to trust here.
    reply.send({ rounds: redactUnrevealedRound1(rounds) });
  });

  // PI-79/80 — the seating chart is intentionally public *before* the
  // pairings reveal above (that's the point: find your seat, then walk over
  // and discover your opponent there, same as the old paper-seating-chart
  // era). Computed server-side from round 1's Match rows and reduced to a
  // plain entrant→seat list — deliberately never the raw {entrantAId,
  // entrantBId} match shape, which is exactly the "opponent pairing" this
  // route must not carry regardless of reveal state.
  app.get("/api/public/o/:slug/pods/:id/seating", async (request, reply) => {
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
    const [round1, entrantCount] = await Promise.all([
      prisma.round.findUnique({
        where: { podId_roundNumber: { podId: pod.id, roundNumber: 1 } },
        include: { matches: { orderBy: { tableNumber: "asc" } } },
      }),
      prisma.entrant.count({ where: { podId: pod.id } }),
    ]);
    const seats = round1 ? computeSeatings(round1.matches, entrantCount) : [];
    reply.send({ seats });
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
    const [rows, entrants, redactor] = await Promise.all([
      computePodStandings(pod.id),
      prisma.entrant.findMany({
        where: { podId: pod.id },
        include: { player: true, team: { include: { members: { include: { player: true } } } } },
      }),
      publicRedactorByTournament(pod.tournamentId),
    ]);
    const entrantById = new Map(entrants.map((e) => [e.id, redactEntrant(e, redactor)]));
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
    const [pulls, redactor] = await Promise.all([
      prisma.cardPull.findMany({
        where: { podId: pod.id },
        include: { player: true },
        orderBy: { priceEur: "desc" },
      }),
      publicRedactorByTournament(pod.tournamentId),
    ]);
    const plain = pulls.map((p) => ({ ...toPlainPull(p), player: shapePublicPlayer(p.player, redactor) }));
    const total = plain.reduce((sum, p) => sum + (p.priceEur ?? 0), 0);
    reply.send({ cardPulls: plain, total });
  });

  // Org-wide public pages — not scoped to any one tournament or pod, the
  // slug alone is the whole access control (same as everything else in
  // this file). This is the "share the whole group's Hall of Fame /
  // Treasure Chest" link.
  app.get("/api/public/o/:slug/hall-of-fame", async (request, reply) => {
    const params = orgParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const organization = await findPublicOrganization(params.data.slug);
    if (!organization) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const [overview, redactor] = await Promise.all([
      computeHallOfFameOverview(organization.id),
      publicRedactor(organization.id),
    ]);
    const players = await prisma.player.findMany({
      where: { id: { in: overview.rankings.map((r) => r.playerId) } },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));
    const hallOfFame = overview.rankings.map((row) => ({
      ...row,
      player: shapePublicPlayer(playerById.get(row.playerId) ?? null, redactor),
    }));

    reply.send({
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      hallOfFame,
      headline: overview.headline,
      longestWinStreak: overview.longestWinStreak
        ? {
            ...overview.longestWinStreak,
            displayName: redactor.name(overview.longestWinStreak.playerId, overview.longestWinStreak.displayName),
          }
        : overview.longestWinStreak,
      mostPlayedPairings: overview.mostPlayedPairings.map((p) => ({
        ...p,
        playerAName: redactor.name(p.playerAId, p.playerAName),
        playerBName: redactor.name(p.playerBId, p.playerBName),
      })),
      biggestPulls: overview.biggestPulls,
    });
  });

  app.get("/api/public/o/:slug/hall-of-fame/players/:playerId", async (request, reply) => {
    const params = orgPlayerParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const organization = await findPublicOrganization(params.data.slug);
    if (!organization) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    // PI-107 — a player hidden from the public pages (Art. 21) has no public
    // stats page at all.
    const subject = await prisma.player.findFirst({
      where: { id: params.data.playerId, orgId: organization.id },
      select: { publicHiddenAt: true },
    });
    if (subject?.publicHiddenAt) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const [stats, redactor] = await Promise.all([
      computePlayerStats(organization.id, params.data.playerId),
      publicRedactor(organization.id),
    ]);
    if (!stats) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const redactH2H = (e: HeadToHeadEntry | null): HeadToHeadEntry | null =>
      e ? { ...e, displayName: redactor.name(e.playerId, e.displayName) } : e;
    reply.send({
      stats: {
        ...stats,
        headToHead: stats.headToHead.map(redactH2H),
        mostPlayedOpponent: redactH2H(stats.mostPlayedOpponent),
        nemesis: redactH2H(stats.nemesis),
        victim: redactH2H(stats.victim),
      },
    });
  });

  app.get("/api/public/o/:slug/treasure-chest", async (request, reply) => {
    const params = orgParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const organization = await findPublicOrganization(params.data.slug);
    if (!organization) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const [pulls, redactor] = await Promise.all([
      prisma.cardPull.findMany({
        where: { pod: { excludeFromStats: false, rarePicksEnabled: true, tournament: { orgId: organization.id } } },
        include: {
          player: true,
          pod: { select: { id: true, name: true, tournament: { select: { id: true, name: true } } } },
        },
        orderBy: { priceEur: "desc" },
        take: 25,
      }),
      publicRedactor(organization.id),
    ]);

    reply.send({
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      cardPulls: pulls.map((p) => ({ ...toPlainPull(p), player: shapePublicPlayer(p.player, redactor) })),
    });
  });
}
