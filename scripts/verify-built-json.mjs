// End-to-end check of the built legacy-data.local.json: reads each pod's
// `rounds` exactly as the importer will (result + gamesWonA/B/Drawn, b:null =
// bye) and runs the SAME tally as podStats.ts (points from result, GW% from
// game counts), then diffs against the known-good expected values.
import { readFileSync } from "node:fs";
import { pods as truth } from "./rounds-data.mjs";

const data = JSON.parse(readFileSync(new URL("../legacy-data.local.json", import.meta.url), "utf8"));
const PW = 3, PD = 1, PL = 0;

function tally(rounds) {
  const points = new Map(), gw = new Map(), gp = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  for (const round of rounds) for (const m of round) {
    const a = m.a, b = m.b;
    if (b === null || b === undefined) { add(points, a, PW); add(gw, a, 2); add(gp, a, 2); continue; }
    const ga = m.gamesA ?? 0, gb = m.gamesB ?? 0, gd = m.gamesDrawn ?? 0, played = ga + gb + gd;
    add(gw, a, ga); add(gp, a, played); add(gw, b, gb); add(gp, b, played);
    if (m.result === "A_WINS") { add(points, a, PW); add(points, b, PL); }
    else if (m.result === "B_WINS") { add(points, b, PW); add(points, a, PL); }
    else { add(points, a, PD); add(points, b, PD); }
  }
  return { points, gw, gp };
}

let ok = true;
for (const t of truth) {
  const tour = data.tournaments.find((x) => x.name === t.tournament);
  const pod = tour?.pods.find((x) => x.name === t.pod);
  if (!pod?.rounds) { ok = false; console.log(`[MISSING ROUNDS] ${t.tournament} / ${t.pod}`); continue; }
  const { points, gw, gp } = tally(pod.rounds);
  const probs = [];
  for (const [p, want] of Object.entries(t.expected)) {
    const got = points.get(p) ?? 0;
    if (got !== want) probs.push(`    POINTS ${p}: got ${got} want ${want}`);
  }
  if (t.gwp) for (const [p, want] of Object.entries(t.gwp)) {
    const got = +(((gw.get(p) ?? 0) / (gp.get(p) || 1)) * 100).toFixed(2);
    if (Math.abs(got - want) > 0.6) probs.push(`    GW% ${p}: got ${got} want ${want}`);
  }
  if (pod.points) probs.push(`    still has points-only field (should be removed)`);
  if (probs.length) { ok = false; console.log(`[FAIL] ${t.pod}`); probs.forEach((x) => console.log(x)); }
  else console.log(`[OK] ${t.tournament} / ${t.pod}`);
}
console.log(ok ? "\nBuilt JSON verified — importer will reproduce every standings table ✔" : "\nProblems above.");
