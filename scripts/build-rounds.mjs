// Injects the validated round-by-round history (scripts/rounds-data.mjs) into
// legacy-data.local.json: for each transcribed pod it sets `rounds` (full
// pairings + game scores) and drops the now-superseded points-only `points`.
// Writes a .bak first. Run: node scripts/build-rounds.mjs
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { pods } from "./rounds-data.mjs";

const FILE = new URL("../legacy-data.local.json", import.meta.url);

const encode = ([a, b, ga, gb, gd = 0]) => {
  if (b === null) return { a, b: null, result: "A_WINS" }; // bye
  const result = ga > gb ? "A_WINS" : gb > ga ? "B_WINS" : "DRAW";
  return { a, b, result, gamesA: ga, gamesB: gb, ...(gd ? { gamesDrawn: gd } : {}) };
};

const data = JSON.parse(readFileSync(FILE, "utf8"));
copyFileSync(FILE, new URL("../legacy-data.local.json.bak", import.meta.url));

let updated = 0;
for (const p of pods) {
  const tournament = data.tournaments.find((t) => t.name === p.tournament);
  if (!tournament) throw new Error(`Tournament not found: ${p.tournament}`);
  const pod = tournament.pods.find((x) => x.name === p.pod);
  if (!pod) throw new Error(`Pod not found: ${p.tournament} / ${p.pod}`);
  pod.rounds = p.rounds.map((round) => round.map(encode));
  delete pod.points;
  updated++;
  const matches = pod.rounds.reduce((n, r) => n + r.length, 0);
  console.log(`  ${p.tournament} / ${p.pod}: ${pod.rounds.length} rounds, ${matches} matches`);
}

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`\nInjected rounds into ${updated} pods. Backup: legacy-data.local.json.bak`);
