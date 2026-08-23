#!/bin/sh
set -e

./node_modules/.bin/prisma migrate deploy --schema server/prisma/schema.prisma

exec node server/dist/index.js
