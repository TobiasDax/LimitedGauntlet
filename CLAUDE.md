# LimitedGauntlet

Self-hosted, open-source Swiss-tournament tracker for MTG Limited (and other) events. Built for Tobias's yearly ~8-10 player weekend GP, designed from the start as a real multi-group OSS project (multi-tenant: one deployment can host several isolated organizations).

Full design rationale lives in [`PLAN.md`](PLAN.md) — read it before making architectural changes. Current build progress and the next concrete task live in [`STEPS.md`](STEPS.md) — **check that file first in any new session**, it's the source of truth for "what's done."

## What this is

Replaces a third-party pairing site (mtgarena.appspot.com) plus manually-maintained Outline docs (per-pod standings, a weekend "Gesamtwertung" overall table, a card-pull "Value" leaderboard) with one app that runs pairing, results, live standings, a round timer, and card-value tracking end-to-end.

## Stack

- **Backend**: Node.js + TypeScript, Fastify (HTTP + WebSocket), Prisma ORM, PostgreSQL 16.
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, TanStack Query, Socket.IO client.
- **Realtime**: Socket.IO, rooms per pod (`pod:<id>`) and per tournament — pairings/standings/timer update live on every connected device, no manual refresh.
- **Packaging**: single multi-stage Dockerfile (frontend build → backend build → slim runtime serving API + WS + static SPA on one port). `docker-compose.yml` = `app` + `db` (postgres:16-alpine) only — no Redis, no extra services. Prisma Migrate runs automatically on container start.

One language end-to-end and a minimal-moving-parts Compose file are deliberate: this is meant to be maintainable by a non-full-time-programmer and easy for other self-hosters to `docker compose up` with just `.env` filled in.

## Data model (see PLAN.md for full field lists)

`Organization` (tenancy boundary, persistent group + roster) → `Tournament` (one yearly weekend, unbounded per org) → `Pod` (one session/draft — Freitag, Samstag 1, Chaosdraft, ...) → `Round` → `Match`. `Entrant` unifies individual players and ad-hoc `Team`s (for 2HG-style team pods) as the thing that gets paired, so the standings/pairing engine doesn't need separate code paths for 1v1 vs team events. `CardPull` tracks value-leaderboard entries per pod.

Key business rules (confirmed against real historical data, do not change without re-checking `PLAN.md`'s historical reference section):
- Team pods credit each member the team's **full** match points (not divided).
- Weekend Gesamtwertung ranks by **average points per pod played**, not raw total (normalizes partial attendance).
- Pairing is Swiss-standard within a pod (hard-avoid repeat opponents), plus a **soft-avoid** on opponents already played anywhere else in the tournament this weekend — the "everyone plays everyone" nudge that the old tool didn't have.

## Conventions

- TypeScript strict mode everywhere, both frontend and backend.
- Prisma schema is the single source of truth for the data model — generate types from it, don't hand-maintain parallel interfaces.
- Standings/pairing math must have test coverage against the real historical fixtures in `PLAN.md`'s "Historical reference data" section (e.g. 2025 Sommer: Devon totals 28, ranked #1) — these are known-good numbers from the actual Outline docs, not invented test data.
- No auth dependency beyond the DB — sessions are encrypted cookies (`@fastify/secure-session`), not a separate session store.
- Public tournament/pod pages must stay unauthenticated (`/o/<slug>/tournaments/<id>/...`) — this is a hard requirement, not a default that can quietly grow a login wall.

## Deploy target

DaxLite (Tobias's Compose-managed infra hub), path `/opt/docker/arcane-projects/limited-gauntlet/compose.yaml`, Arcane-managed like everything else there. Tobias runs the actual deploy himself (per his global git/infra conventions — Claude prepares the compose file and steps but doesn't touch live infra unannounced). Once deployed, it gets documented in the `claude-memory` repo's `infra/services/daxlite.md`, not here — this repo's docs stay scoped to the project itself.

## Related

- Historical source data (4 years of Outline docs this replaces) transcribed into `PLAN.md`'s reference section and `scripts/legacy-data.json` (once written) for the one-time import.
- Cross-referenced from the `claude-memory` repo's `projects.md` "Linked CLAUDE.md files" list, same pattern as `nixos-config` and `homeassitant-mcp-projects`.
