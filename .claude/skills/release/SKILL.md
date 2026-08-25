---
name: release
description: Use when Tobias wants to cut a new LimitedGauntlet release ("let's release", "cut a release", "tag a new version", "publish vX.Y.Z", "hit a milestone, let's ship it"). Walks the full tag → GitHub Release → GHCR image pipeline for this repo, including the Forgejo mirror sync pause that a past release got burned skipping.
version: 0.1.0
---

# Cutting a LimitedGauntlet release

This repo's `origin` is Forgejo (`ssh://git@git.shire-census.ts.net/tobias/LimitedGauntlet.git`), which push-mirrors to `github.com/TobiasDax/LimitedGauntlet`. The GitHub Release + the `.github/workflows/docker-publish.yml` GHCR build both live on the **GitHub** side, but everything is pushed from here through the mirror first. That mirror hop is the one place this has broken before (see Troubleshooting) — the pause in step 6 exists specifically to catch it before `gh release create` runs against a stale `main`.

Do not skip straight to `gh release create` after pushing the tag. The mirror is not instant and not guaranteed to succeed silently.

## Steps

**1. Preflight.**
- `git status --short` — must be clean. If not, stop and ask Tobias what to do with the outstanding changes rather than releasing over them.
- `git rev-parse --abbrev-ref HEAD` — must be `main`.
- Check `git tag -l` for the highest existing `vX.Y.Z` tag — this release must be higher.

**2. Decide the version.** Ask Tobias if not already specified (as a skill arg or in the request): patch for fixes only, minor for a batch of new features/roadmap items since the last tag, major for breaking changes. Default recommendation: minor, since releases here tend to bundle several shipped roadmap items at once. Confirm the exact `vX.Y.Z` before proceeding — don't guess and run with it.

**3. Bump the version.** Update `"version"` in the root `package.json` only (this repo uses a single shared version — `server`/`client`/`mcp` stay unversioned, per the PI-22 decision recorded in `ROADMAP.md`).

**4. Draft release notes.** Summarize what shipped since the last tag:
- `git log <last-tag>..HEAD --oneline` for the raw commit list.
- Cross-reference `ROADMAP.md`'s `✅` items and `docs/BUILD-LOG.md` for the human-readable framing of what each change actually does — don't just paste commit subjects, write it like the v0.1.0 notes (grouped by theme: e.g. "Pairing & ops", "Design", "Security" — whatever groupings fit what actually shipped this time).
- Write it to a scratch file at the repo root, e.g. `RELEASE_NOTES_vX.Y.Z.md` (untracked — this is `gh release create -F` input, not permanent repo content; it gets deleted after use, same as every past release).
- Include a "Known limitations" section only if something genuinely relevant changed; don't carry it forward reflexively.

**5. Commit, tag, and push.**
```sh
git add package.json  # plus any ROADMAP.md updates marking shipped items done
git commit -m "vX.Y.Z: <one-line summary>"
git tag -a vX.Y.Z -m "vX.Y.Z — <one-line summary>"
git push origin main
git push origin vX.Y.Z
```
Both the branch and the tag need to reach GitHub before the release step — push `main` explicitly, don't assume the tag push alone carries the branch along.

**6. STOP. Pause here for Tobias.** Tell him explicitly:
> Pushed to Forgejo. Please trigger a manual sync (Forgejo repo → Settings → Mirror Settings → Synchronize Now, or wait for the automatic one) before I check GitHub.

Wait for his go-ahead, then verify before touching `gh` at all:
- `git log -1 --format=%H main` locally, compare against `https://api.github.com/repos/TobiasDax/LimitedGauntlet/commits/main` (WebFetch, with a `?cb=<random>` cache-buster — this endpoint gets cached and will lie about freshness otherwise) — SHAs must match.
- Confirm the tag ref exists on GitHub: `https://api.github.com/repos/TobiasDax/LimitedGauntlet/git/ref/tags/vX.Y.Z` (also cache-busted).

If either check fails, do not proceed — tell Tobias the sync hasn't landed yet (or check Forgejo's mirror log with him for a repeat of the `workflow` scope rejection or something new) and wait. This check is the entire reason this skill exists; the first release shipped a stale commit because this step was skipped.

**7. Create the release.**
```sh
gh release create vX.Y.Z --repo TobiasDax/LimitedGauntlet --title "vX.Y.Z" --notes-file RELEASE_NOTES_vX.Y.Z.md
```
`--repo` is required — `gh` can't infer the GitHub repo from a Forgejo `origin`.

**8. Verify the GHCR build fired.** `release: published` should auto-trigger `.github/workflows/docker-publish.yml`. Check:
```
https://api.github.com/repos/TobiasDax/LimitedGauntlet/actions/runs?cb=<random>
```
Confirm the most recent "Publish Docker image" run has `status: completed`, `conclusion: success`, event `release`. If it didn't fire (e.g. the workflow file itself wasn't on `main` at publish time — check this if a workflow-touching commit was part of *this* release), it can be run manually: Actions tab → "Publish Docker image" → **Run workflow** (the `workflow_dispatch` trigger exists for exactly this).

**9. Clean up.** Delete the scratch `RELEASE_NOTES_vX.Y.Z.md` once the release is confirmed live (ask first if unsure — Tobias has asked for this explicitly every time so far).

**10. Update ROADMAP.md** if this release closes out any open roadmap items — mark them `✅` and link the release, matching how PI-22 was closed out.

## Troubleshooting

**Mirror push rejected with `refusing to allow a Personal Access Token to create or update workflow ... without workflow scope`:** the PAT Forgejo uses for the GitHub push-mirror needs the `workflow` scope (classic PAT) or "Workflows: read and write" (fine-grained PAT) — this is required for *any* push that touches `.github/workflows/*`, not just the first time. Tobias needs to update the token in his GitHub account settings and re-save it in Forgejo's mirror config; not something fixable from this session. This blocks the **entire** mirror push, not just the workflow file — so a rejection here means the tag and every other file in that push silently didn't arrive either.

**`gh release create` runs but the release points at the wrong commit:** almost always means step 6's check was skipped or passed on stale (cached) data and the mirror hadn't actually finished. Fix: `gh release delete vX.Y.Z --repo TobiasDax/LimitedGauntlet --yes --cleanup-tag`, fix the local tag (`git tag -d vX.Y.Z && git tag -a vX.Y.Z -m "..."` at the correct commit), re-push, re-verify, re-create.

**WebFetch shows stale GitHub state:** it has a 15-minute cache. Always append a cache-busting query param (`?cb=<anything>`) when re-checking after a fix, or you'll re-verify against the same stale response.
