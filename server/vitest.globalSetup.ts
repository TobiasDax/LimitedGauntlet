import { execFileSync } from "node:child_process";

// Bring the test database's schema up to date before the suite runs, so a
// freshly-started `docker-compose.test.yml` container just works. `migrate
// deploy` is a fast no-op when everything is already applied. Skipped if the
// DB is unreachable — the individual tests then fail with a clear connection
// error rather than this masking it.
const DEFAULT_TEST_DB = "postgresql://postgres:test@127.0.0.1:5842/lgtest";

export default function setup() {
  // globalSetup runs in the main process, before test.env is applied to
  // workers, so mirror vitest.config.ts's default here.
  const url = process.env.DATABASE_URL ?? DEFAULT_TEST_DB;
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: new URL(".", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
      timeout: 60_000,
    });
  } catch {
    // Leave it to the tests to surface the real problem.
  }
}
