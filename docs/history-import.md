# History Import

If you're migrating from spreadsheets, a legacy pairing site, or manually-maintained docs instead of starting fresh, `server/src/scripts/import-legacy.ts` reads a JSON file of past tournament history — names, pods, points, card pulls — and inserts it directly via Prisma. It's idempotent (safe to re-run; existing rows are left alone rather than duplicated) and never goes through the HTTP API.

## The data file

**Not part of this repo.** Real tournament history is real people's names and results, and doesn't belong in a git history — even a private one. Supply your own as `legacy-data.local.json` at the repo root (gitignored) matching the shape in `server/src/scripts/import-legacy.ts`'s `LegacyData` interface, or point at a file anywhere else via `LEGACY_DATA_PATH`.

## Building that file by hand is the hard part

This project ships a Claude Code skill for it: [`import-history`](../.claude/skills/import-history/SKILL.md). If you're using Claude Code against this repo, run `/import-history` and describe (or paste) whatever your existing records look like — a spreadsheet, an old pairing site export, Outline/Notion docs, plain notes, screenshots. It knows the exact JSON schema the importer expects, interviews you tournament-by-tournament and pod-by-pod, and validates name/format consistency before writing the file (the importer itself throws on the first bad reference and doesn't roll back what it already inserted, so getting this right up front matters). No Claude Code? The schema and gotchas are all documented in that same skill file — readable on its own even without running it as a skill.

## Running the import

```sh
docker compose exec app node server/dist/scripts/import-legacy.js /path/to/your-data.json
# or: LEGACY_DATA_PATH=/path/to/your-data.json docker compose exec app node server/dist/scripts/import-legacy.js
```

Creates an organization and one organizer login — this is the one path into the app that works regardless of `ALLOW_SIGNUP`. Defaults to a generic org slugged `gp` (named `GP`) — harmless as a default, but you'll want your own group's details; set these first:

```sh
IMPORT_ORG_SLUG=your-group
IMPORT_ORG_NAME="Your Group's Name"
IMPORT_ORGANIZER_EMAIL=organizer@example.com
IMPORT_ORGANIZER_PASSWORD=              # generated + printed once if left unset — log in and change it
IMPORT_ORGANIZER_NAME=Organizer
```

## Idempotency and duplicate-name guard

The import is idempotent **per org**, keyed on the slug: re-running with the same `IMPORT_ORG_SLUG` reuses that org and skips tournaments/pods/players it already has. As a guard, if an org with the same **name** already exists under a *different* slug, the script refuses (that would silently create a second, separate org sharing the name) — either re-run pointing `IMPORT_ORG_SLUG` at the existing org's slug, or set `IMPORT_ALLOW_DUPLICATE_NAME=1` to deliberately create a separate one.

## Card-pull attribution backfill

If you've logged historical card pulls without per-player attribution (or from before that existed), a one-time backfill script guesses attribution for already-completed pods from finish + card value:

```sh
docker compose exec app node server/dist/scripts/infer-existing-card-pulls.js
```

Every guess is marked as inferred and reviewable/reassignable from the pod's Value tab; nothing it writes is treated as final until a human confirms it. Safe to re-run — idempotent, never overwrites an attribution a human has already set or confirmed.
