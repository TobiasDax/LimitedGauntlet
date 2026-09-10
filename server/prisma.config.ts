// Prisma 7 moved schema/migrations/datasource config out of schema.prisma and
// package.json into this file (PI-109). Lives in server/ so `prisma/config`
// resolves from server/node_modules; the CLI finds it when run with cwd=server
// (the npm scripts, CI) or with `--config server/prisma.config.ts` (the Docker
// entrypoint, which runs from /app). Config-relative paths resolve against
// this file's directory.
//
// Prisma 7's CLI no longer auto-loads .env, so do it here — checking the repo
// root (../.env, the documented local-dev location) as well as server/.env.
// `prisma generate` needs no datasource URL, so the block is only added when
// DATABASE_URL is actually present (migrate / db commands).
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: [".env", "../.env"], quiet: true });

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url
    ? {
        datasource: {
          url,
          // Set only in CI (the migration-drift shadow DB). Ignored when unset.
          shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
        },
      }
    : {}),
});
