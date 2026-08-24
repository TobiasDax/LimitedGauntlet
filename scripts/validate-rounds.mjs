// Recomputes points + GW% from the transcribed rounds (scripts/rounds-data.mjs)
// using the SAME math as server/src/services/{podStats,standings}.ts and diffs
// against each Outline standings table. Points must match exactly; GW% is
// checked where gwp !== null (byes / unrepresentable drawn games are skipped).
import { pods } from "./rounds-data.mjs";

const POINTS_WIN = 3, POINTS_DRAW = 1, POINTS_LOSS = 0;

function tally(matches) {
  const points=new Map(), mp=new Map(), gw=new Map(), gp=new Map();
  const add=(m,k,v)=>m.set(k,(m.get(k)??0)+v);
  let drawCount=0;
  for(const [a,b,ga,gb,gd=0] of matches){
    if(b===null){ add(points,a,POINTS_WIN); add(mp,a,1); add(gw,a,2); add(gp,a,2); continue; }
    add(mp,a,1); add(mp,b,1);
    const played=ga+gb+gd;
    add(gw,a,ga); add(gp,a,played); add(gw,b,gb); add(gp,b,played);
    if(ga>gb){ add(points,a,POINTS_WIN); add(points,b,POINTS_LOSS); }
    else if(gb>ga){ add(points,b,POINTS_WIN); add(points,a,POINTS_LOSS); }
    else { add(points,a,POINTS_DRAW); add(points,b,POINTS_DRAW); drawCount++; }
  }
  return {points,gw,gp,drawCount};
}

let ok=true, totalDraws=0;
for(const pod of pods){
  const {points,gw,gp,drawCount}=tally(pod.rounds.flat());
  totalDraws += drawCount;
  const players=Object.keys(pod.expected);
  const probs=[];
  for(const p of players){
    const gotPts=points.get(p)??0, wantPts=pod.expected[p];
    if(gotPts!==wantPts) probs.push(`    POINTS ${p}: got ${gotPts} want ${wantPts}`);
  }
  if(pod.gwp){
    for(const p of players){
      const got=+(((gw.get(p)??0)/(gp.get(p)||1))*100).toFixed(2), want=pod.gwp[p];
      if(want!==undefined && Math.abs(got-want)>0.6) probs.push(`    GW% ${p}: got ${got} want ${want}`);
    }
  }
  if(probs.length){ ok=false; console.log(`\n[MISMATCH] ${pod.tournament} / ${pod.pod}`); probs.forEach(x=>console.log(x)); }
  else console.log(`[OK] ${pod.pod} — ${players.length} players, ${drawCount} drawn match(es)${pod.gwp?" (points+GW%)":" (points only)"}`);
}
console.log(`\n${ok?"ALL RECONCILE ✔":"MISMATCHES ABOVE"} — ${totalDraws} drawn matches across all pods, each scored 1/1.`);
