import { prisma } from "../prisma.js";

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// How many times each pair of players has already faced each other
// anywhere in the tournament (across all pods, all rounds — pending or
// completed matches both count, since a repeat pairing is a repeat
// pairing as soon as it's generated). Team matches count every member of
// side A against every member of side B. Keyed by sorted "playerA:playerB".
//
// Pass excludePodId to look at "everywhere else this weekend" — the pod
// currently being paired already has its own hard-avoid-repeats rule, so
// including it here would just be redundant, not wrong.
export async function computePlayerPairHistory(
  tournamentId: string,
  excludePodId?: string,
): Promise<Map<string, number>> {
  const pods = await prisma.pod.findMany({
    where: { tournamentId, ...(excludePodId ? { id: { not: excludePodId } } : {}) },
    include: {
      entrants: { include: { team: { include: { members: true } } } },
      rounds: { include: { matches: true } },
    },
  });

  const entrantPlayers = new Map<string, string[]>();
  for (const pod of pods) {
    for (const entrant of pod.entrants) {
      if (entrant.playerId) {
        entrantPlayers.set(entrant.id, [entrant.playerId]);
      } else if (entrant.team) {
        entrantPlayers.set(
          entrant.id,
          entrant.team.members.map((m) => m.playerId),
        );
      }
    }
  }

  const pairCounts = new Map<string, number>();
  const bump = (a: string, b: string) => {
    const key = pairKey(a, b);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  };

  for (const pod of pods) {
    for (const round of pod.rounds) {
      for (const match of round.matches) {
        if (!match.entrantBId) continue; // bye, no opponent to record
        const playersA = entrantPlayers.get(match.entrantAId) ?? [];
        const playersB = entrantPlayers.get(match.entrantBId) ?? [];
        for (const a of playersA) {
          for (const b of playersB) {
            bump(a, b);
          }
        }
      }
    }
  }

  return pairCounts;
}
