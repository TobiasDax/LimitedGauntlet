import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifySecureSession from "@fastify/secure-session";
import "./auth/types.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { authRoutes } from "./routes/auth.js";
import { playerRoutes } from "./routes/players.js";
import { tournamentRoutes } from "./routes/tournaments.js";
import { podRoutes } from "./routes/pods.js";
import { roundRoutes } from "./routes/rounds.js";
import { cardPullRoutes } from "./routes/cardPulls.js";
import { publicRoutes } from "./routes/public.js";
import { initRealtime } from "./realtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

// Socket.IO and Fastify have to share one raw http.Server, and the order
// here is load-bearing: Socket.IO's attach() saves+removes whatever
// 'request' listeners are already registered and wraps them, forwarding
// anything that isn't a socket.io request through to them. That only
// works if Fastify's listener is registered FIRST — hence serverFactory
// (which runs synchronously inside the Fastify(...) call below) has to
// happen before `initRealtime` creates the Socket.IO server. Doing this
// in the wrong order means both frameworks try to answer the same
// requests and one of them silently loses.
const httpServer = createServer();

const app = Fastify({
  logger: true,
  serverFactory: (handler) => {
    httpServer.on("request", handler);
    return httpServer;
  },
});

initRealtime(httpServer);

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
await app.register(tournamentRoutes);
await app.register(podRoutes);
await app.register(roundRoutes);
await app.register(cardPullRoutes);
await app.register(publicRoutes);

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
