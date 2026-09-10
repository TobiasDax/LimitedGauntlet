// PI-109 — single import point for the Prisma 7 generated client.
//
// Prisma 7's `prisma-client` generator emits into the source tree
// (src/generated/prisma/, gitignored) instead of node_modules, and there's no
// more `@prisma/client` re-export to import model types / enums / the `Prisma`
// namespace from. Everything routes through this barrel so the ~25 call sites
// use one stable path, and so the driver-adapter wiring lives in one place.
//
// The Rust-free client needs a driver adapter for every connection — the
// shared singleton (services, routes) and the per-file clients the test suite
// and import-legacy spin up all go through `makePrismaClient()`.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";

export function makePrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg(url) });
}
