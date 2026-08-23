import type { Entrant } from "./types";

export function entrantDisplayName(entrant: Entrant): string {
  if (entrant.player) return entrant.player.displayName;
  if (entrant.team) return entrant.team.name;
  return "—";
}
