import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifySecureSession from "@fastify/secure-session";
import "./auth/types.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { authRoutes } from "./routes/auth.js";
import { playerRoutes } from "./routes/players.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

const app = Fastify({ logger: true });

await app.register(fastifySecureSession, {
  key: config.sessionKey,
  cookieName: "session",
  cookie: {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.sessionCookieSecure,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

app.get("/api/healthz", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

await app.register(authRoutes);
await app.register(playerRoutes);

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

app
  .listen({ port: config.port, host: config.host })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
