# PI-95 load test

Simulates the roadmap's "~60 phones at a venue" scenario against a real
running instance: ~60 viewer VUs polling public pod/tournament pages, plus
a small burst of organizer result submissions partway through. Goal is real
p95/error-rate/memory numbers to decide whether the in-process standings
cache (PI-95's other open item) is actually needed, and if so what TTL is
safe.

## Before you run it

**Use a disposable test tournament, never a real one.** This script PATCHes
real match results via `POST /api/matches/:id/result` — running it against
an actual tournament's pods would corrupt real standings. Create a
throwaway test org + tournament + pod on the **same live instance** (not a
separate deploy) — you want to measure the real box's capacity, just
against data nobody cares about. A pod with ~30 real (non-bye) matches in
an active round gives enough `BURST_MATCH_IDS` for the burst scenario.

**The global rate limiter will interfere unless you account for it.**
`server/src/index.ts` registers a default `max: 200` requests/minute
**per source IP** (`@fastify/rate-limit`, `trustProxy` set from
`TRUSTED_PROXIES`). In real venue conditions that's per-phone, so it's a
non-issue. But this script's ~60+ VUs all originate from **one** machine —
one apparent IP to the server — so they'll all share a single 200/min
bucket regardless of which device you run it from. At the default sleep
window that's roughly 150-350 req/min just from viewers, before the
organizer burst, so you WILL hit 429s that don't reflect anything a real
event would see.

**Fixed:** the limit is now env-configurable — set `RATE_LIMIT_MAX` (e.g.
`1000`) in the deployment's `.env` before the test window, restart, run the
test, then set it back to `200` (or remove the line) afterward.

A first run without this (2026-09-15) confirmed the theory exactly: 100% of
organizer result-submission checks failed and ~2% of viewer GETs failed,
while `docker stats` showed **no CPU or memory spike at all** — the server
wasn't struggling, the rate limiter was just blocking a single-IP flood.
Don't read a 429-heavy run as "the app can't handle load."

## Which device to run it from

Prefer an always-on machine you control (e.g. another box in your own
homelab/infra) over a personal or company-managed laptop: it doesn't
depend on a laptop staying awake for the run's duration, and it avoids any
question of a work device generating a sustained burst of outbound HTTP
traffic (which can trip corporate EDR/security tooling, or sit in a policy
gray area). A machine you already run monitoring on (CPU/mem dashboards)
is a bonus — you can correlate the test window against real resource
graphs directly.

Don't worry about which network the runner sits on: the venue's real
conditions (phones on venue WiFi) can't be replicated from a home machine
either way, so it doesn't matter whether the runner is on the same LAN as
the app's host or not — what matters is concurrent load against the live
server, which is location-agnostic as long as you're hitting the public
URL, not an internal LAN IP.

## Running it

No install needed — run via Docker:

```sh
docker run --rm -i --network host \
  -e BASE_URL=https://limited-gauntlet.com \
  -e ORG_SLUG=your-test-org-slug \
  -e TOURNAMENT_ID=... \
  -e POD_ID=... \
  -e ORGANIZER_EMAIL=... \
  -e ORGANIZER_PASSWORD=... \
  -e BURST_MATCH_IDS=id1,id2,id3,... \
  -e VIEWER_VUS=60 \
  -e ORGANIZER_VUS=3 \
  -e DURATION=5m \
  -e BURST_AT=2m \
  grafana/k6 run - < pod-load-test.js
```

While it runs, watch on the live host:

```sh
docker stats limited-gauntlet-live   # CPU / memory
docker exec -it <postgres container> psql -U postgres -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

k6's own summary at the end gives you `http_req_duration` (watch p95) and
`http_req_failed` (error rate) — the two numbers the roadmap's load-test
item asks for.

## After the test

- If p95/error-rate/memory look fine under this load: the in-process cache
  probably isn't needed yet — note the numbers in `ROADMAP.md` and consider
  the load test item done for now, revisit before a much bigger event.
- If not: the numbers here (which endpoint is slowest, whether it's DB-bound
  via `pg_stat_activity`, memory growth) tell us where the cache should
  actually target, and what TTL is defensible.
- Delete the disposable test tournament/org afterward.
