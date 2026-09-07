---
name: release
description: Use when Tobias wants to cut a new LimitedGauntlet release ("let's release", "cut a release", "tag a new version", "publish vX.Y.Z", "hit a milestone, let's ship it"). Walks the tag → GHCR image → GitHub Release pipeline for this repo.
version: 0.2.0
---

# Cutting a LimitedGauntlet release

`origin` is Forgejo (`ssh://git@git.shire-census.ts.net/tobias/LimitedGauntlet.git`), which push-mirrors to `github.com/TobiasDax/LimitedGauntlet` **on every push** (`sync_on_commit`). Pushing a `vX.Y.Z` tag to Forgejo is the entire trigger: the mirror carries the tag to GitHub within seconds, and `.github/workflows/docker-publish.yml` fires on that tag — builds the image, pushes it to GHCR, and opens a **draft** GitHub Release. Your job after the push is: verify the tag landed, then fill in the release notes and publish the draft.

There is no `gh release create` step and no manual mirror sync. The old race (creating a release against a stale `main`) is gone — the workflow can't run before the tag exists on GitHub.

## Steps

**1. Preflight.**
- `git status --short` — must be clean. If not, stop and ask Tobias what to do with the outstanding changes.
- `git rev-parse --abbrev-ref HEAD` — must be `main`.
- `git tag -l 'v*'` — note the highest existing tag; this release must be higher.
- `git fetch origin && git log origin/main..HEAD` — should be empty (local `main` already pushed) or only the release commit you're about to make.

**2. Decide the version.** Ask Tobias if not already specified: patch for fixes only, minor for a batch of shipped features/roadmap items, major for breaking changes. Default recommendation: minor. Confirm the exact `vX.Y.Z` before proceeding.

**3. Bump the version + close roadmap items.**
- Update `"version"` in the **root** `package.json` only (single shared version — `server`/`client`/`mcp` stay unversioned, per PI-22).
- In `ROADMAP.md`, mark any items this release ships as `✅` and note the version, matching how earlier items were closed out. Move fully-done items to `docs/BUILD-LOG.md` if that's the pattern for the section.

**4. Draft release notes** to a scratch file at the repo root, `RELEASE_NOTES_vX.Y.Z.md` (gitignored via `/RELEASE_NOTES_v*.md`; deleted in step 10):
- `git log <last-tag>..HEAD --oneline` for the raw list.
- Cross-reference `ROADMAP.md`'s `✅` items and `docs/BUILD-LOG.md` for what each change actually does — write it grouped by theme (e.g. "Pairing & ops", "Security", "CI & tooling"), like the v0.1.0 notes, not a commit-subject dump.
- "Known limitations" section only if something genuinely relevant changed.

**5. Commit, tag, push.**
```sh
git add package.json ROADMAP.md docs/BUILD-LOG.md
git commit -m "vX.Y.Z: <one-line summary>"
git tag -a vX.Y.Z -m "vX.Y.Z — <one-line summary>"
git push origin main
git push origin vX.Y.Z
```
Push `main` first, then the tag.

**6. Verify the tag reached GitHub.** The mirror is fast but not instant. Wait ~15s, then (WebFetch, cache-busted with `?cb=<random>` — this endpoint caches and will lie):
- `https://api.github.com/repos/TobiasDax/LimitedGauntlet/git/ref/tags/vX.Y.Z` — must resolve, and its `object.sha` must match `git rev-parse vX.Y.Z^{commit}` locally (the ref may be an annotated-tag object; follow it, or compare against `git rev-parse vX.Y.Z^{}`).

If it 404s, wait and retry. If it's still missing after a couple of minutes, check Forgejo's mirror log with Tobias for a `workflow`-scope rejection (see Troubleshooting) — that blocks the whole push silently.

**7. Watch the GHCR build.** The tag push auto-triggers `docker-publish.yml`. Check (cache-busted):
- `https://api.github.com/repos/TobiasDax/LimitedGauntlet/actions/runs?event=push&cb=<random>` — the newest "Publish Docker image" run for `refs/tags/vX.Y.Z` should reach `status: completed`, `conclusion: success`.
- Or use the Forgejo CI token (`~/.config/forgejo-token`) only for Forgejo-side runs — this build is GitHub-side, so use the GitHub API.

If it fails, read the run log before retrying. A `workflow_dispatch` re-run is available from the Actions tab.

**8. Fill in the notes and publish the draft.** The workflow left a draft release for `vX.Y.Z` with auto-generated notes as a starting point. Replace them with the curated file and publish:
```sh
gh release edit vX.Y.Z --repo TobiasDax/LimitedGauntlet \
  --notes-file RELEASE_NOTES_vX.Y.Z.md --draft=false --latest
```
`--repo` is required (`gh` can't infer it from a Forgejo `origin`). Add `--prerelease` instead of `--latest` for an `-rc`/`-beta` tag.

**9. Verify the release + image are live.**
- `https://api.github.com/repos/TobiasDax/LimitedGauntlet/releases/tags/vX.Y.Z?cb=<random>` — `draft: false`, notes present.
- `https://api.github.com/orgs/... ` isn't needed; confirm the image tags exist: `docker buildx imagetools inspect ghcr.io/tobiasdax/limitedgauntlet:X.Y.Z` (or check the package page). `:X.Y.Z`, `:X.Y`, `:latest` should all be present for a normal release.

**10. Clean up.** `rm RELEASE_NOTES_vX.Y.Z.md` — the published release is the permanent copy. No need to ask; it's gitignored (`/RELEASE_NOTES_v*.md`) so it was never going to be committed anyway.

## Troubleshooting

**Mirror push rejected — `refusing to allow a Personal Access Token to create or update workflow ... without workflow scope`:** the PAT Forgejo uses for the GitHub push-mirror needs `workflow` scope (classic PAT) / "Workflows: read and write" (fine-grained). Required for *any* push touching `.github/workflows/*`. Tobias updates the token in GitHub settings and re-saves it in Forgejo's mirror config. **This blocks the entire mirror push** — a rejection here means the tag and every other file in that push didn't arrive either.

**Tag on GitHub but no workflow run:** the workflow file on `main` at the tagged commit must have the `push: tags` trigger. If *this* release is the one that introduces/changes the trigger, the tagged commit already has it — fine. If somehow not, trigger manually: Actions → "Publish Docker image" → Run workflow (rebuilds `:latest` from main, not the tag — for a tag build you need the tag re-pushed or a fixed workflow).

**Build ran but `:latest` didn't move:** `docker/metadata-action`'s `latest=auto` only applies `:latest` for a non-prerelease semver tag. An `-rc` tag deliberately doesn't touch `:latest`.

**WebFetch shows stale GitHub state:** 15-minute cache. Always append `?cb=<random>` when re-checking after a change.
