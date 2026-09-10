// PI-102 follow-up — boot-time guard for the image's runtime dependencies.
//
// The Dockerfile's runtime stage copies only /app/node_modules. If npm's
// resolver de-hoists a server dependency into /app/server/node_modules (it has
// done this before — see ROADMAP PI-102, the v0.9.0 boot-crash), that package
// never makes it into the image and the server crashes on its first `import`
// of it, *after* migrations have already run. This check fails fast and loud
// before `node server/dist/index.js`, naming exactly what's missing.
//
// Checks presence, not resolvability: an ESM-only package with an `exports`
// map isn't `require.resolve`-able from CJS even when correctly installed, so
// we just look for its directory in the node_modules the image actually has.

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const serverPkg = require(path.join(root, "server", "package.json"));
const deps = Object.keys(serverPkg.dependencies || {});

const missing = deps.filter((dep) => !fs.existsSync(path.join(root, "node_modules", dep, "package.json")));

if (missing.length > 0) {
  console.error(`FATAL: runtime dependencies missing from this image: ${missing.join(", ")}`);
  console.error(
    "This usually means a package de-hoisted to server/node_modules and the Docker build only copies /app/node_modules. " +
      "Regenerate package-lock.json from a clean checkout and rebuild the image.",
  );
  process.exit(1);
}
