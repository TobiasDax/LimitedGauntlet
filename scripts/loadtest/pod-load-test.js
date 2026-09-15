// PI-95 load test — ~60 viewer VUs polling public pod/tournament pages,
// plus a small burst of organizer result submissions, to see how the live
// instance holds up under real-event-shaped load before deciding whether
// the in-process standings cache is actually needed (and what TTL is safe).
//
// Run with k6 (https://k6.io) — either a local install, or via Docker with
// no install at all:
//
//   docker run --rm -i --network host \
//     -e BASE_URL -e ORG_SLUG -e TOURNAMENT_ID -e POD_ID \
//     -e ORGANIZER_EMAIL -e ORGANIZER_PASSWORD -e BURST_MATCH_IDS \
//     -e VIEWER_VUS -e ORGANIZER_VUS -e DURATION -e BURST_AT \
//     grafana/k6 run - < pod-load-test.js
//
// See README.md in this directory for required setup (a DISPOSABLE test
// tournament — this script submits real match results) and env vars.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://limited-gauntlet.com";
const ORG_SLUG = __ENV.ORG_SLUG;
const TOURNAMENT_ID = __ENV.TOURNAMENT_ID;
const POD_ID = __ENV.POD_ID;

const ORGANIZER_EMAIL = __ENV.ORGANIZER_EMAIL;
const ORGANIZER_PASSWORD = __ENV.ORGANIZER_PASSWORD;
const ORGANIZER_VUS = Number(__ENV.ORGANIZER_VUS || 3);

// Comma-separated Match ids to PATCH during the burst — every match must
// already have a real (non-bye) opponent. Ten total across all organizer
// VUs combined roughly matches the roadmap's "10 results in 5s" scenario.
const BURST_MATCH_IDS = (__ENV.BURST_MATCH_IDS || "").split(",").filter(Boolean);

if (!ORG_SLUG || !TOURNAMENT_ID || !POD_ID) {
  throw new Error("ORG_SLUG, TOURNAMENT_ID, and POD_ID are required — see README.md");
}

export const options = {
  scenarios: {
    viewers: {
      executor: "constant-vus",
      vus: Number(__ENV.VIEWER_VUS || 60),
      duration: __ENV.DURATION || "5m",
      exec: "viewer",
    },
    // Fires once, partway through the viewer load, so we can see the effect
    // of a round-end result burst on top of steady background traffic —
    // this is the "60 clients refetch, 60 recomputes" scenario PI-95's
    // in-process cache is meant to fix.
    organizers: {
      executor: "per-vu-iterations",
      vus: ORGANIZER_VUS,
      iterations: 1,
      exec: "organizerBurst",
      startTime: __ENV.BURST_AT || "2m",
    },
  },
  thresholds: {
    // Starting point only — tighten once you've seen a real baseline run.
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

const VIEWER_PATHS = () => [
  `/api/public/o/${ORG_SLUG}/tournaments/${TOURNAMENT_ID}`,
  `/api/public/o/${ORG_SLUG}/tournaments/${TOURNAMENT_ID}/gesamtwertung`,
  `/api/public/o/${ORG_SLUG}/pods/${POD_ID}`,
  `/api/public/o/${ORG_SLUG}/pods/${POD_ID}/standings`,
  `/api/public/o/${ORG_SLUG}/pods/${POD_ID}/rounds`,
];

export function viewer() {
  const paths = VIEWER_PATHS();
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE_URL}${path}`);
  check(res, { "status is 200": (r) => r.status === 200 });
  // Approximates a phone that glances at the page, not one polling in a
  // tight loop — the app's own staleTime (30s) plus Socket.IO push covers
  // the "someone else just reported a result" case in real usage; this
  // script doesn't open a Socket.IO connection, so treat these numbers as a
  // worst-case (pure-HTTP) floor, not the literal real-world request rate.
  sleep(10 + Math.random() * 20);
}

export function organizerBurst() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: ORGANIZER_EMAIL, password: ORGANIZER_PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(loginRes, { "login ok": (r) => r.status === 200 });
  if (loginRes.status !== 200) return;

  // k6 persists the session cookie from the login response automatically
  // for the rest of this VU's requests (default per-VU cookie jar).
  const vuIndex = (__VU - 1) % ORGANIZER_VUS;
  const mine = BURST_MATCH_IDS.filter((_, i) => i % ORGANIZER_VUS === vuIndex);

  for (const matchId of mine) {
    const res = http.patch(
      `${BASE_URL}/api/matches/${matchId}/result`,
      JSON.stringify({ result: "A_WINS", gamesWonA: 2, gamesWonB: 1, gamesDrawn: 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
    check(res, { "result submitted": (r) => r.status === 200 });
    sleep(0.5); // stagger within the burst rather than firing all at once
  }
}
