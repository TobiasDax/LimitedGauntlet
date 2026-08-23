import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { prisma } from "./prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

const app = Fastify({ logger: true });

app.get("/api/healthz", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

// Serves the built SPA in production. During `npm run dev`, the Vite dev
// server runs separately and this directory won't exist yet — that's fine,
// the API still works standalone.
await app.register(fastifyStatic, {
  root: clientDistPath,
  wildcard: false,
});

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api")) {
    reply.code(404).send({ error: "not_found" });
    return;
  }
  reply.sendFile("index.html");
});

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
