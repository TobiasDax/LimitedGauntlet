// PI-102 follow-up — boot-time guard for the image's runtime dependencies.
//
// The Dockerfile's runtime stage copies only /app/node_modules. If npm's
// resolver de-hoists a package into /app/server/node_modules (it has done this
// before — see ROADMAP PI-102, the v0.9.0 boot-crash, and PI-109 where the
// `prisma` CLI de-hoisted and the container couldn't run `migrate deploy`),
// that package never makes it into the image. This check fails fast and loud
// before the entrypoint touches it, naming exactly what's missing.
//
// Checks presence, not resolvability: an ESM-only package with an `exports`
// map isn't `require.resolve`-able from CJS even when correctly installed, so
// we just look for its directory in the node_modules the image actually has.

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const serverPkg = require(path.join(root, "server", "package.json"));

// Everything server/dist imports at runtime …
const deps = Object.keys(serverPkg.dependencies || {});
// … plus what the entrypoint itself needs before the app even starts:
// the Prisma CLI (`./node_modules/.bin/prisma migrate deploy`) and what
// server/prisma.config.ts imports (dotenv, prisma/config).
const bootDeps = ["prisma", "dotenv"];

const missing = [...deps, ...bootDeps].filter(
  (dep) => !fs.existsSync(path.join(root, "node_modules", dep, "package.json")),
);
if (!fs.existsSync(path.join(root, "node_modules", ".bin", "prisma"))) {
  missing.push("prisma (.bin/prisma)");
}

if (missing.length > 0) {
  console.error(`FATAL: dependencies missing from this image: ${[...new Set(missing)].join(", ")}`);
  console.error(
    "This usually means a package de-hoisted to server/node_modules and the Docker build only copies /app/node_modules. " +
      "Declare it in the root package.json (see the //dependencies note there) and regenerate package-lock.json.",
  );
  process.exit(1);
}
