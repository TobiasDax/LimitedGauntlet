# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature. [Ideas (unlikely to be built)](#ideas-unlikely-to-be-built) at the bottom holds things that came up but aren't active backlog — don't pick those up without checking with Tobias first.

## Status

The app is **feature-complete and running in production** — latest release **v0.15.1**, public demo at [limited-gauntlet.com](https://limited-gauntlet.com). The full numbered build (Steps 0–12) and the bulk of the PI-1…PI-112 backlog are shipped and browser-verified; all of that detail is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md). The roadmap below is only what's still open.

**v0.15.1:** PI-116 (running app version shown in the footer, linked to its GitHub release page — code-complete, browser-verify pending).

**v0.15.0:** PI-92 (CI now builds the Docker image and runs a boot smoke test on every PR, closing the last gap in project-health coverage — full write-up in the build log). PI-113 (webhook SSRF hardening) and PI-39 (legacy-data.json import via the Settings UI) shipped their code here and are now fully deployed/browser-verified — closed out in the build log.

**v0.14.0:** PI-115 (split a large draft/chaos-draft pod into multiple physical tables — shape picker, pair-preserving table fill, per-table seating on both the organizer and public pages; browser/data-verified against a real 20-entrant pod, including a seat-numbering bug caught and fixed via that testing).

**v0.14.1:** a column-mode alignment bug in PI-114's responsive seating chart, caught on a real phone right after v0.14.0 shipped — column mode's empty-slot spacer for an odd entrant count wasn't taking up any vertical space, misaligning the two columns. PI-114 is now fully browser-verified and closed out in the build log.

**Live instance (DaxLite, `limited-gauntlet-live`):** running **v0.15.0** as of 2026-09-15, deploy confirmed working. Recently shipped **and** browser-verified, now in the build log: PI-75 (operator signup webhook), PI-76–84 (the pod-list cluster — reorder, finished-pods sink, Scheduled/On-demand tabs, timestamps, date dividers, pod cancel), PI-85 (deployer analytics), PI-86 (one login across multiple orgs), PI-87 (Settings/Profile split), PI-88–92 / 93 / 94 / 98 (project-health: CI on Forgejo, ESLint + Prettier, tag-triggered GHCR release, container hardening, the `@fastify/compress` hotfix, CI's PR-time image build + boot smoke test), PI-96/97 (player detail page, per-pod entrant count), PI-99/100 (pod participation fix + on-demand side events), PI-103–108 / 110 (the GDPR/DSGVO pass + privacy round 2, v0.10.0–v0.11.0), PI-112 (built-in `/legal` page, v0.12.0), PI-102 / PI-109 / PI-111 (boot-time dep guard, Prisma 7, ESLint 10 — v0.13.0), PI-115 (multi-table draft splits, v0.14.0/v0.14.1), PI-114 (responsive seating chart, v0.14.0/v0.14.1), PI-39 (legacy-data.json import UI, v0.15.0), PI-113 (webhook SSRF hardening, v0.15.0).

**Dependency majors batch** (`deps/majors-2026-09`, PR #1, **shipped in v0.10.0**): argon2, nodemailer 10, Vite 8 / Vitest 5, zod 4, openid-client 6, TypeScript 7-native builds. Prisma 6→7 was split off as **PI-109** and the ESLint-stack majors as **PI-111** — both shipped in **v0.13.0** and deployed to the live instance 2026-09-10 (`migrate deploy` a no-op — schema unchanged). PI-101 (the security pass — `npm audit` was 0; now 2 dev-only advisories from the Prisma 7 CLI, see PI-109's build-log entry) closed 2026-09-10; full tranche notes are in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

## Open items

Only genuinely-open work lives here. Everything shipped **and** browser-verified is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

- **PI-95** — read-path performance before the 40–60 player event: client + query-shape parts shipped (v0.8.0); the in-process standings cache and the real-deploy load test are still open. (Response compression stays reverted, see PI-98.) The load test now also wants to cover the Prisma 7 driver adapter's connection-pool behaviour (PI-109, v0.13.0).
- **PI-116** — show the running app version in the footer, linked to its GitHub release page: code-complete, browser-verify pending.

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once it's shipped **and** browser-verified._

> **Verification note:** the dev sandbox can't run the app (no Docker) or a full `vite build`, so items are built and typechecked (`tsc -b`) there, then browser-verified separately by Tobias on a real running instance. A bare ✅ means shipped and browser-verified; "code-complete, browser-verify pending" means the code is in but not yet checked on a live deploy.

### PI-116 — Show the running app version in the footer, linked to its release notes ⏳ (code-complete 2026-09-15, browser-verify pending)
Idea from Tobias (2026-09-15): put the running version number next to the GitHub link in `client/src/components/Footer.tsx`, linking to that version's GitHub release page (`https://github.com/TobiasDax/LimitedGauntlet/releases/tag/vX.Y.Z`) — easy access to the release notes for whatever's actually deployed, without needing to know the version to look it up.

- [x] **Version reaches the frontend.** `server/src/config.ts` reads `version` from the root `package.json` (the single shared version per PI-22) at startup, resolved relative to `config.ts`'s own file location so it works identically from `tsx` dev and the compiled `server/dist` runtime regardless of `process.cwd()` (same pattern `index.ts` already used for `clientDistPath`). Exposed as `appVersion` on the existing public `GET /api/app-config` endpoint (`server/src/routes/auth.ts`) — no new env var, and it can't drift from what's actually built into the image.
- [x] **Footer change:** `client/src/components/Footer.tsx` renders a `vX.Y.Z` link right after the GitHub link (same `linkClass` styling) pointing at `.../releases/tag/vX.Y.Z`, only when `appVersion` has loaded.
- [x] `tsc -b`/`eslint`/`prettier` clean on all three workspaces.
- [ ] **Not yet browser-verified** — this sandbox has no Docker/browser to click through the actual rendered footer. Tobias should confirm the version link appears and resolves to the correct release page on a real running instance.

## Project-health backlog (from the 2026-09-06 code audit)

Not feature work — these harden the project itself. None is a live bug at this app's scale (Tobias's own event is 8–10 players); they matter because it's a public OSS project anyone can `docker compose up`, and because a year of AI-assisted sessions has no automated gate catching regressions. The CI / lint / release / hardening keystones (PI-88–92, 93, 94) are shipped and in the build log; what's left below is the still-open remainder plus the dependency and Prisma items.

### PI-95 — Read-path performance for a 40–60 player event ⏳ (client + query-shape parts shipped v0.8.0; in-process cache + load test still open)
Moving the live instance to a 14 GB box (PI-94) took memory pressure off the table, but the app still recomputes everything from Postgres on every request and the client refetches aggressively. Under ~50 phones at a venue this is a real load pattern — cheap to fix, worth doing before the event.

- [x] **`QueryClient` defaults.** `main.tsx` now sets `staleTime: 30_000` + `refetchOnWindowFocus: false` (was a bare `new QueryClient()` → TanStack's `staleTime: 0` + focus-refetch, so every phone-unlock refetched every query on screen). Realtime Socket.IO invalidation still keeps watched data fresh where it matters. Biggest lever.
- [ ] **In-process cache for `computeGesamtwertung` / `computePodStandings`** — a `Map` keyed by tournament/pod id with a short TTL, busted on the `standings-changed` / pod events. Turns "a result lands → 60 clients refetch → 60 recomputes" into 1 recompute + 60 cache hits. No Redis (fits the stack constraint). **Deferred:** correctness-sensitive (a stale post-result standings is a real bug), and the TTL wants the load test below to tune/verify — not safe to land blind from the dev sandbox.
- [x] **Parallelized `computeGesamtwertung`'s pod loop** — was a serial `for (const pod of pods) { await computePodStandings(pod.id) }` (~50 sequential round-trips for a 10-pod tournament); now `Promise.all` over the pods, then the point-accumulation loop stays sequential for determinism. Confirmed the needed indexes already exist: `Match.roundId` (`@@index([roundId])`), `Round.podId` (`@@unique([podId, roundNumber])` covers it), `Entrant.podId` (`@@index([podId])`).
- [x] ~~**Response compression** — `@fastify/compress` (`global: true`) registered in `index.ts`.~~ **Reverted in v0.8.1 (PI-98).** On the live deploy (Node 22, behind Cloudflare) the plugin returned `200` with `content-length: 0` and an empty body for the larger nested API responses (`/api/tournaments/:id`, and by extension the public tournament/pod pages) — the `vary: accept-encoding` header was there but no payload. Smaller responses (`/api/players`, `/api/tournaments`, gesamtwertung) were fine, so it's size/streaming-triggered. Couldn't reproduce in the Node 20 dev sandbox with the full middleware stack, so root cause is unconfirmed. Behind Cloudflare the plugin bought the live deploy nothing anyway (CF already Brotli's everything); a LAN/non-CF deployer loses on-the-fly compression until this is re-approached with a real load/repro test.
- [ ] **Load test** on the real deploy (k6 / artillery from off-box): ~60 viewer VUs on pod + tournament pages + 2–3 organizer VUs submitting results to drive the broadcast fan-out; watch p95, error rate, `docker stats` mem, `pg_stat_activity`. Include an end-of-round burst (10 results in 5 s).

## Ideas (unlikely to be built)

Things that came up as a possible feature but that Tobias doesn't expect to actually build — kept here for the scoping/context in case priorities ever change, not active backlog. Don't pick one of these up without checking with him first.

### PI-62 — Deck photos (parked 2026-09-14)
Idea from Tobias (2026-08-31): on a pod's standings page, let each entrant have a photo of their drafted deck attached. Scoped via a full interview before any code — see `docs/BUILD-LOG.md` git history / this file's own prior revisions for the complete scoping notes if it's ever revisited. Short version of what was decided:

- **The app's first-ever user-uploaded file** — every prior "image" in the app (Scryfall card art) is a hotlinked external URL; `PLAN.md`/`CLAUDE.md` explicitly rule out file uploads elsewhere (PI-31) as a deliberate scope boundary this would cross.
- Organizer-upload v1, player self-upload later (on top of PI-52's player auth); local-disk storage (a new bind-mounted volume, no S3); validate + re-encode through `sharp` (a new dependency) to reject non-images and strip embedded metadata/polyglot payloads; a generated preview shown by default, original available via explicit zoom/download actions; public visibility matching the rest of standings but hidden-by-default behind a modal.
- Real open questions flagged at scoping time and never resolved: new file-serving routes respecting the PI-27 password lock, filesystem cleanup on delete (the app's first delete path with a non-DB side effect), and a second thing (the photo volume) for self-hosters to back up.

Parked because it's "more involved" than the rest of the backlog for a feature Tobias isn't confident anyone would actually use — not rejected for a technical reason, just deprioritized indefinitely.
