---
name: import-history
description: Use when a user wants to import past tournament history into LimitedGauntlet from their own records — spreadsheets, Outline/Notion docs, plain notes, screenshots, an old pairing site export, anything. Triggers on "import my history", "migrate my old data", "I have past tournament results", "how do I use import-legacy", "set up legacy-data.json". Interviews the user about their source data, builds a valid legacy-data.json against server/src/scripts/import-legacy.ts's actual schema, validates it, and hands back the exact command to run it.
version: 0.1.0
---

# Importing historical tournament data

`server/src/scripts/import-legacy.ts` reads one JSON file and inserts an organization's entire past history via Prisma directly (not the HTTP API). This skill's job is producing a **valid** JSON file from whatever messy format the user's real data is actually in — that's the hard part; running the script afterward is one command.

**Read the actual script before relying on this doc for anything subtle.** The interfaces below are transcribed from `server/src/scripts/import-legacy.ts` as of when this skill was written — if the schema in this file and the script ever disagree, the script is right. Re-read it if something here seems off.

**Privacy, always first:** never write real names/results into any file this skill's process reads back into the repo's tracked history. The output file must be named to match the repo's existing `.gitignore` pattern — `legacy-data*.json` at the repo root (e.g. `legacy-data.local.json`) — which is already excluded. Don't rename it to something the gitignore pattern won't catch, and don't paste real data into a commit message, an issue, or anywhere else that isn't that one gitignored file.

## The target shape

```ts
interface LegacyData {
  players: string[];              // every player who ever appears anywhere below, by exact display name
  tournaments: LegacyTournament[];
}

interface LegacyTournament {
  name: string;
  startDate: string;              // ISO date, "YYYY-MM-DD" is fine — fed straight into `new Date(...)`
  endDate: string;
  location: string;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";   // historical imports are almost always COMPLETED
  players: string[];               // who attended THIS tournament — subset of the top-level players[]
  pods: LegacyPod[];
}

interface LegacyPod {
  name: string;
  format: "DRAFT" | "SEALED" | "CHAOS_DRAFT" | "CONSTRUCTED" | "CUSTOM";
  points?: Record<string, number>;           // name -> final points, for a pod with NO round-by-round data
  cardPulls?: Array<{ cardName: string; priceEur: number }>;
  isTeamEvent?: boolean;
  teamSize?: number;                          // default 2 when isTeamEvent
  roundCount?: number;                        // default 3 (team pods only — cosmetic, informational)
  matchFormat?: "BO1" | "BO3";                 // default BO1 (team pods only — cosmetic, informational)
  teams?: Array<{ name: string; members: string[] }>;   // required when isTeamEvent
  rounds?: LegacyMatch[][];                    // outer array = rounds in order, inner = tables in that round
}

interface LegacyMatch {
  a: string;                       // player name (individual pod) or team name (team pod)
  b: string | null;                // same; null = a bye for `a`
  result: "A_WINS" | "B_WINS" | "DRAW";
  gamesA?: number;                 // individual pods only — real game score, e.g. 2
  gamesB?: number;
  gamesDrawn?: number;             // a tied game within the match, individual pods only
}
```

## How the importer decides what to do with each pod

This determines what data you actually need to extract from the source material — don't gather more than the branch you're hitting requires, and don't guess at a branch that doesn't fit what the source actually has.

1. **`pod.isTeamEvent` true** → team pod. Needs `teams` (name + member names). If `rounds` is also present, imports full round-by-round match history against team names. If `rounds` is omitted, the teams/entrants are created with **zero points and zero games** — there's no team-pod equivalent of the individual `points`-only fallback. If the source only has a team pod's final standings and no round data, say so explicitly to the user: it'll import as an empty scoreless pod unless they can reconstruct rounds, or they accept that gap.
2. **`pod.isTeamEvent` falsy, `pod.rounds` present and non-empty** → full round-by-round import. Standings (points + OMW%/GW%/OGW% tiebreakers) get computed from real matches, not hardcoded. Prefer this whenever the source actually has per-round pairings/results — it's strictly more useful than option 3.
3. **`pod.isTeamEvent` falsy, no `rounds`, `pod.points` present** → points-only import via `finalPointsOverride`. Use this when the source only ever recorded a final standings table (common for older/lazier record-keeping) — the importer stores the final total directly and tiebreaker columns show as 0, matching that there's nothing to compute them from. **Don't fabricate rounds that were never recorded** just to hit branch 2 — PLAN.md's own design note is explicit about this: a pod with only final standings imports as points-only, not synthesized pairings.
4. **Neither `rounds` nor `points`** → pod is created with zero entrants (an empty `SETUP` pod). Rarely what anyone wants for a *historical* import — if you land here, double-check the source data wasn't actually available under a different label before accepting an empty pod.

`cardPulls` is independent of all of the above and applies to any pod.

## Gotchas that will break the import if you don't catch them first

- **Name consistency is everything, and there's no dry-run.** Every name used in `t.players`, `pod.points` keys, `LegacyMatch.a`/`.b`, and `team.members` must exactly string-match an entry in the top-level `players[]`. The script throws immediately on the first mismatch (`references unknown player "..."`) and **does not roll back** what it already inserted for that tournament — earlier `prisma.*.create` calls in the same run stay committed. Validate every name reference against the top-level roster *before* handing the file to the script, not after a failed run. Watch especially for: nickname vs. full name drift across different source documents, trailing whitespace, and inconsistent capitalization — all real problems seen in this project's own history import (see `docs/BUILD-LOG.md` Step 10's name-drift note).
- **`b: null` marks a bye.** Give it `result: "A_WINS"` (matching how a bye is scored everywhere else in the app — full points, no opponent).
- **Team-pod match games are auto-derived from `result`, not from anything you supply.** `A_WINS` → 1-0, `B_WINS` → 0-1. A team `DRAW` is representable (`result: "DRAW"`) but games land at 0-0 with no `gamesDrawn` equivalent — team pods don't carry the same drawn-game granularity individual pods do. Don't try to pass `gamesA`/`gamesB`/`gamesDrawn` on a team match; they're silently ignored.
- **Idempotent, but only at the tournament and pod level.** Re-running skips a tournament entirely if one already exists by that exact `name`, and skips a pod entirely (entrants/rounds) if one already exists by that exact `name` within the tournament — but it *still* attempts to attach any `cardPulls` listed for an already-existing pod (dedup'd by `cardName`, so safe to re-list). If you need to fix bad data in a pod that already imported, delete that specific pod from the app UI first, then re-run — the script won't overwrite or repair it in place.
- **`constructedFormat`/`constructedFormatCustom` are supported.** `import-legacy.ts`'s `LegacyPod` interface carries both, and `importStandingsPod`/`importTeamPod` write them — a `CONSTRUCTED` pod can record which constructed format was played (`constructedFormat: "MODERN"` etc., or `"CUSTOM"` + `constructedFormatCustom: "Canadian Highlander"`). Only meaningful when `format === "CONSTRUCTED"`.
- **`legacy-data*.json` is already gitignored** at the repo root — don't second-guess that or add real data anywhere else.
- **`IMPORT_ORG_SLUG`/`IMPORT_ORG_NAME`/`IMPORT_ORGANIZER_EMAIL`/`IMPORT_ORGANIZER_PASSWORD`/`IMPORT_ORGANIZER_NAME`** env vars control the org + first login the script creates (defaults are generic placeholders — slug `gp`, name `GP` — make sure the user sets their own before running, per the README's History import section). Re-running under a *different* slug than an existing same-named org is refused unless `IMPORT_ALLOW_DUPLICATE_NAME=1` is set.

## Process

1. **Ask what the source material actually is** — spreadsheet export, Outline/Notion doc text, screenshots, a plain description from memory, an old pairing tool's export, whatever. Ask the user to paste or share it rather than guessing at structure.
2. **Identify the full player roster first.** Build the top-level `players[]` list before touching tournaments — this is the list every other name gets checked against, so get it right and complete up front. Ask the user to confirm it, especially if the source has any name-spelling inconsistencies.
3. **Go tournament by tournament.** For each: name, dates (ask for at least approximate dates if the source doesn't record exact ones — don't fabricate false precision; if genuinely unknown, ask the user how they'd like to handle it rather than inventing a date), location, status (almost always `COMPLETED` for a historical import), and the attending roster.
4. **Go pod by pod within each tournament**, applying the decision tree above. Ask clarifying questions when the source is ambiguous about which branch fits (e.g. "does this pod have round-by-round results, or just a final standings table?").
5. **Draft the JSON incrementally and show it to the user** rather than producing the whole file silently at the end — historical data has a way of surfacing corrections mid-transcription (this project's own import found real name-drift and transcription-total mismatches this way; hand-check summed points against any documented "total" column the source provides, the same way).
6. **Validate before finalizing:** every name reference resolves against `players[]`; every `format`/`status`/`result`/`matchFormat` value is one of the allowed enum strings (exact case); team pods have `teams` with member counts matching `teamSize` if one's specified; dates parse. Walk the whole draft file once specifically checking these rather than trusting it looks right.
7. **Write the file** as `legacy-data.local.json` at the repo root (or ask if the user wants a different gitignore-matching name/path).
8. **Hand back the run command**, reminding them to set the `IMPORT_*` env vars first:
   ```sh
   docker compose exec app node server/dist/scripts/import-legacy.js /path/to/legacy-data.local.json
   # or, if the file is already inside the container's mounted path:
   docker compose exec app node server/dist/scripts/import-legacy.js legacy-data.local.json
   ```
   Mention the generated-password behavior if `IMPORT_ORGANIZER_PASSWORD` is left unset (printed once to the log, log in and change it).
9. **After a real run**, offer to help spot-check the result against the source (a Gesamtwertung/standings page total matching a hand-summed total from the source is the same verification approach this project's own import used) rather than assuming success from a clean exit code.
