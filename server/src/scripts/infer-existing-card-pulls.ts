// One-time (but idempotent, safe to re-run) backfill: runs the
// auto-inference heuristic (see services/cardPullInference.ts) across
// every pod, for pulls logged before the heuristic existed. New pulls and
// newly-completed pods get this automatically going forward — wired into
// the add-card-pull, round-complete, and match-result-correction routes.
// This just catches up the backlog. Never touches a pull a human has
// already set or confirmed. Run once after deploying this feature:
//   docker compose exec app node server/dist/scripts/infer-existing-card-pulls.js
import { prisma } from "../prisma.js";
import { inferCardPullAttribution } from "../services/cardPullInference.js";

const pods = await prisma.pod.findMany({ where: { isTeamEvent: false }, select: { id: true, name: true } });

let podsTouched = 0;
let pullsTouched = 0;
for (const pod of pods) {
  const before = await prisma.cardPull.count({ where: { podId: pod.id, playerId: { not: null } } });
  await inferCardPullAttribution(pod.id);
  const after = await prisma.cardPull.count({ where: { podId: pod.id, playerId: { not: null } } });
  if (after > before) {
    podsTouched++;
    pullsTouched += after - before;
    console.log(`${pod.name}: attributed ${after - before} pull(s)`);
  }
}

console.log(`Done. ${pullsTouched} pull(s) attributed across ${podsTouched} pod(s).`);
process.exit(0);
