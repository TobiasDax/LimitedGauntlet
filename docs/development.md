# Development

This page covers building LimitedGauntlet from source and running it locally for development. If you just want to run the app, see the main [`README.md`](../README.md)'s Quick Start (published image) instead — none of this is needed just to deploy.

## Building from source

Only needed if you're modifying the app, or deploying on a platform without a published image.

```sh
git clone https://github.com/TobiasDax/LimitedGauntlet.git
cd LimitedGauntlet
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

This builds the same single-image, `db` + `app` Compose stack as the published image — just built locally instead of pulled from GHCR. No manual database setup: migrations apply automatically before the server starts.

## Local development (outside Docker)

For fast iteration on the app itself — hot-reload, no image rebuild per change:

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET, as above
docker compose up -d db   # just Postgres, published on localhost:5432 (add a docker-compose.override.yml — see .env.example — since the base file publishes no host port by default)

npm install
npm run dev:server   # Fastify on :8080, loads ../.env for DATABASE_URL etc.
npm run dev:client   # Vite dev server, proxies /api and /socket.io to :8080
```

`npm run prisma:migrate --workspace server` applies schema changes locally against that same Postgres.

## Tests and builds

Server tests run against a **real Postgres**, not a mocked database — pairing,
standings, and other business-rule logic is verified against actual query
results. They create and drop their own rows, so they need a throwaway database,
not your dev one. `docker-compose.test.yml` provides it:

```sh
docker compose -f docker-compose.test.yml up -d     # tmpfs Postgres on 127.0.0.1:5842
npm run --workspace server test                     # auto-migrates that DB, then runs
docker compose -f docker-compose.test.yml down -v   # when done
```

`npm run --workspace server test` defaults `DATABASE_URL` to that container and
runs `prisma migrate deploy` against it before the suite (a fast no-op once
applied). Set `DATABASE_URL` explicitly to point the suite elsewhere.

```sh
npm run build   # typecheck + build all three workspaces (server, mcp, client)
```

The client has no separate test framework; UI changes are verified by hand against a running instance.

## Continuous integration

`.forgejo/workflows/ci.yml` runs the typecheck/build of all three workspaces
plus the server test suite (against a throwaway Postgres 16 service container)
on every push to `main` and every pull request.

It runs on **Forgejo Actions**, not GitHub Actions — `origin` is the Forgejo
instance and GitHub is only a downstream push-mirror, so Forgejo is where
pushes and PRs actually land. It needs a runner:

- Register an [`act_runner`](https://forgejo.org/docs/latest/admin/actions/)
  against the Forgejo instance with a **Docker backend** (it needs to start the
  Postgres service container), advertising the `ubuntu-latest` label.
- Enable Actions for the repository (Settings → Advanced, or instance-wide).

The GHCR image publish (`.github/workflows/docker-publish.yml`) stays
GitHub-only — it's guarded with `if: github.server_url == 'https://github.com'`
so a Forgejo runner picking it up is a no-op.
