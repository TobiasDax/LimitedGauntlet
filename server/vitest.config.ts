import { defineConfig } from "vitest/config";

// Test defaults so `npm run --workspace server test` works against the
// `docker-compose.test.yml` container with no env fiddling. An explicit
// DATABASE_URL / SESSION_SECRET in the environment always wins.
//   - DATABASE_URL: the throwaway test-db container (127.0.0.1:5842). The suite
//     creates its own rows, so pointing this at anything real would be a
//     mistake — the default is deliberately an obviously-test URL.
//   - SESSION_SECRET: a throwaway 32-byte value; some modules load config.ts
//     (which requires it) at import time.
export default defineConfig({
  test: {
    // Only the source tests. `tsc -p tsconfig.json` also emits the compiled
    // `.test.js` files into `dist/`, and Vitest 5 no longer excludes `dist/`
    // by default (Vitest ≤4 did), so without this the suite runs every file
    // twice.
    include: ["src/**/*.test.ts"],
    globalSetup: ["./vitest.globalSetup.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:test@127.0.0.1:5842/lgtest",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "00".repeat(32),
    },
  },
});
