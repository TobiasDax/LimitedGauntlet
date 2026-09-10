#!/bin/sh
set -e

# PI-102 — fail loudly if a runtime dependency didn't make it into the image
# (npm can de-hoist a lone-consumer server dep into server/node_modules, which
# the Dockerfile doesn't copy). Cheap; catches the class of bug that crash-
# looped v0.9.0 *after* migrations had already run.
node preflight.cjs

./node_modules/.bin/prisma migrate deploy --config server/prisma.config.ts

exec node server/dist/index.js
