import { z } from "zod";
import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";

// Tokens (PI-72) — an opt-in per-org player currency. Everything here is a
// no-op / rejection when the org has Organization.tokensEnabled = false.

export const zStandingBonus = z.object({
  fromPlace: z.number().int().min(1).max(1000),
  toPlace: z.number().int().min(1).max(1000),
  tokens: z.number().int(),
});
export const zStandingBonuses = z
  .array(zStandingBonus)
  .max(50)
  .refine((rows) => rows.every((r) => r.toPlace >= r.fromPlace), "toPlace must be >= fromPlace");

export type StandingBonus = z.infer<typeof zStandingBonus>;

export class TokensDisabledError extends Error {
  constructor() {
    super("tokens_disabled");
  }
}

export async function isTokensEnabled(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { tokensEnabled: true } });
  return org?.tokensEnabled ?? false;
}

// A pod overrides either field independently — null on the pod = inherit the
// tournament value.
export function resolvePodTokenConfig(
  pod: { tokenParticipation: number | null; tokenStandingBonuses: unknown },
  tournament: { tokenParticipation: number; tokenStandingBonuses: unknown },
): { participation: number; bonuses: StandingBonus[] } {
  const rawBonuses = pod.tokenStandingBonuses ?? tournament.tokenStandingBonuses;
  const parsed = zStandingBonuses.safeParse(rawBonuses);
  return {
    participation: pod.tokenParticipation ?? tournament.tokenParticipation,
    bonuses: parsed.success ? parsed.data : [],
  };
}

export function standingBonusFor(place: number, bonuses: StandingBonus[]): number {
  const row = bonuses.find((b) => place >= b.fromPlace && place <= b.toPlace);
  return row ? row.tokens : 0;
}

// The single idempotent reconciler for a pod's automatic token awards *and*
// (PI-77) its completion timestamp. Called after anything that can change the
// pod's standings, completion, or cancellation state.
export async function syncPodTokenAwards(podId: string): Promise<void> {
  const pod = await prisma.pod.findUnique({
    where: { id: podId },
    include: {
      tournament: { include: { organization: { select: { id: true, tokensEnabled: true } } } },
      rounds: { select: { roundNumber: true, status: true } },
      entrants: { include: { team: { include: { members: { select: { playerId: true } } } } } },
    },
  });
  if (!pod) return;

  const finalRoundDone = pod.rounds.some((r) => r.roundNumber === pod.roundCount && r.status === "COMPLETED");

  // PI-77: stamp/clear completedAt purely off finalRoundDone, independent of
  // Organization.tokensEnabled — every deployment needs this for the pod-list
  // finished/unfinished partition, not just ones with tokens on. Stamped once
  // (not refreshed on every later sync) so it stays "when it first finished";
  // cleared back to null if roundCount is raised after completion re-opens
  // the pod (see the DELETE /api/rounds/:id undo-pairing comment).
  if (finalRoundDone && !pod.completedAt) {
    await prisma.pod.update({ where: { id: podId }, data: { completedAt: new Date() } });
  } else if (!finalRoundDone && pod.completedAt) {
    await prisma.pod.update({ where: { id: podId }, data: { completedAt: null } });
  }

  if (!pod.tournament.organization.tokensEnabled) return;

  const orgId = pod.tournament.organization.id;
  const AUTO = ["POD_PARTICIPATION", "POD_STANDING"] as const;

  // PI-84: a canceled pod never earns automatic awards, even if every round
  // happens to already be COMPLETED (excludeFromStats alone doesn't cover
  // tokens — this is the audited gap the cancel feature needs closed here).
  const eligibleForAwards = finalRoundDone && !pod.canceledAt;
  if (!eligibleForAwards) {
    await prisma.tokenTransaction.deleteMany({ where: { podId, reason: { in: [...AUTO] } } });
    return;
  }

  const { participation, bonuses } = resolvePodTokenConfig(pod, pod.tournament);
  const standings = await computePodStandings(podId);
  const playersByEntrant = new Map<string, string[]>();
  for (const e of pod.entrants) {
    playersByEntrant.set(
      e.id,
      e.playerId ? [e.playerId] : (e.team?.members.map((m) => m.playerId) ?? []),
    );
  }

  const rows: { orgId: string; playerId: string; delta: number; reason: (typeof AUTO)[number]; podId: string }[] = [];
  standings.forEach((row, i) => {
    const place = i + 1;
    const bonus = standingBonusFor(place, bonuses);
    for (const playerId of playersByEntrant.get(row.entrantId) ?? []) {
      if (participation !== 0) rows.push({ orgId, playerId, delta: participation, reason: "POD_PARTICIPATION", podId });
      if (bonus !== 0) rows.push({ orgId, playerId, delta: bonus, reason: "POD_STANDING", podId });
    }
  });

  await prisma.$transaction([
    prisma.tokenTransaction.deleteMany({ where: { podId, reason: { in: [...AUTO] } } }),
    prisma.tokenTransaction.createMany({ data: rows }),
  ]);
}

export async function getPlayerTokenBalance(orgId: string, playerId: string): Promise<number> {
  const agg = await prisma.tokenTransaction.aggregate({ where: { orgId, playerId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

export interface TokenLedgerEntry {
  id: string;
  delta: number;
  reason: "POD_PARTICIPATION" | "POD_STANDING" | "MANUAL" | "INITIAL";
  note: string | null;
  podName: string | null;
  organizerName: string | null;
  createdAt: string;
}

export async function getPlayerTokenLedger(
  orgId: string,
  playerId: string,
): Promise<{ balance: number; transactions: TokenLedgerEntry[] }> {
  const rows = await prisma.tokenTransaction.findMany({
    where: { orgId, playerId },
    orderBy: { createdAt: "desc" },
    include: { pod: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
  const balance = rows.reduce((sum, r) => sum + r.delta, 0);
  return {
    balance,
    transactions: rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      note: r.note,
      podName: r.pod?.name ?? null,
      organizerName: r.createdBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// Organizer add / deduct / "set balance to X" — one MANUAL (or INITIAL) row.
export async function recordManualTokenTxn(
  orgId: string,
  playerId: string,
  organizerId: string,
  input: { delta?: number; setTo?: number; note?: string; initial?: boolean },
): Promise<{ balance: number }> {
  if (!(await isTokensEnabled(orgId))) throw new TokensDisabledError();
  const player = await prisma.player.findFirst({ where: { id: playerId, orgId }, select: { id: true } });
  if (!player) throw new Error("player_not_found");

  let delta: number;
  let note = input.note?.trim() || null;
  if (typeof input.setTo === "number") {
    const current = await getPlayerTokenBalance(orgId, playerId);
    delta = input.setTo - current;
    note = note ? `Set balance to ${input.setTo} — ${note}` : `Set balance to ${input.setTo}`;
  } else if (typeof input.delta === "number") {
    delta = input.delta;
  } else {
    throw new Error("no_amount");
  }

  await prisma.tokenTransaction.create({
    data: { orgId, playerId, delta, reason: input.initial ? "INITIAL" : "MANUAL", note, createdById: organizerId },
  });
  return { balance: await getPlayerTokenBalance(orgId, playerId) };
}
