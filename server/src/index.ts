import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifySecureSession from "@fastify/secure-session";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import "./auth/types.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { authRoutes } from "./routes/auth.js";
import { playerRoutes } from "./routes/players.js";
import { playerAccountRoutes } from "./routes/playerAccounts.js";
import { tournamentRoutes } from "./routes/tournaments.js";
import { podRoutes } from "./routes/pods.js";
import { roundRoutes } from "./routes/rounds.js";
import { cardPullRoutes } from "./routes/cardPulls.js";
import { hallOfFameRoutes } from "./routes/hallOfFame.js";
import { apiTokenRoutes } from "./routes/apiTokens.js";
import { settingsRoutes } from "./routes/settings.js";
import { publicRoutes } from "./routes/public.js";
import { trackingRoutes } from "./routes/tracking.js";
import { createAppRealtimeRoomAuthorizer, initRealtime } from "./realtime.js";

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
  // Only explicitly configured peers may supply forwarding headers. This is
  // also the shared security boundary for @fastify/rate-limit's request.ip key.
  trustProxy: config.trustedProxies,
  serverFactory: (handler) => {
    httpServer.on("request", handler);
    return httpServer;
  },
});

// CSP tuned to what this app actually loads: same-origin scripts/styles
// (Vite's build, no external CDN), Scryfall's card-image CDN, and
// same-origin fetch/WebSocket (API + Socket.IO share this origin). PI-85's
// analytics script (when configured) is same-origin too — routes/tracking.ts
// proxies it from the deployer's TRACKING_SCRIPT_URL — so script-src/
// connect-src never need a third-party origin added at all; the original
// approach here allowlisted the tracking host directly, but that meant this
// app's own CSP had to be loosened per-deployment, and a third-party
// "analytics.*" host serving a stock "script.js" filename is exactly what
// ad-blocker lists filter — found on the marketing site (a separate static
// repo) and fixed the same way there first, see that repo's
// ANALYTICS-CSP-FINDINGS.md.
// frameAncestors 'none' blocks embedding this app in an iframe elsewhere
// (clickjacking) — there's no legitimate reason to embed it. HSTS only
// turned on once SESSION_COOKIE_SECURE says we're actually behind TLS —
// same reasoning as that flag: forcing HTTPS redirects on a plain-HTTP
// LAN deployment would just break it for a year (HSTS is heavily cached).
//
// upgradeInsecureRequests is one of helmet's CSP defaults and has to be
// explicitly disabled (not just omitted) on a plain-HTTP deployment: it
// tells the browser to rewrite every http:// asset/API request on the page
// to https:// before sending it — which, on a server that only speaks
// HTTP (LAN-only, or behind a tunnel that terminates TLS upstream), turns
// into every single asset failing with ERR_SSL_PROTOCOL_ERROR and the SPA
// never mounting. Caught by loading the app in a real browser after adding
// this CSP — it typechecks fine either way, this only shows up at runtime.
await app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://cards.scryfall.io", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.sessionCookieSecure ? [] : null,
    },
  },
  hsts: config.sessionCookieSecure,
  // Same story as HSTS/upgradeInsecureRequests above: COOP is a
  // browser-enforced isolation policy that only makes sense (and only
  // avoids a console warning) once the origin is actually HTTPS.
  crossOriginOpenerPolicy: config.sessionCookieSecure ? { policy: "same-origin" } : false,
});

// A generous default across the whole app (catches generic scraping/abuse)
// — auth.ts sets much tighter per-route limits on login/signup specifically,
// since those are the routes brute-force/spam actually target.
await app.register(fastifyRateLimit, {
  max: 200,
  timeWindow: "1 minute",
});

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

// Initialize Socket.IO after secure-session so its separate handshake can use
// the same battle-tested cookie decoder for room authorization. Fastify's raw
// request listener was already attached synchronously in serverFactory above,
// preserving the required Fastify-before-Socket.IO listener order.
initRealtime(httpServer, createAppRealtimeRoomAuthorizer(app));

// Best-effort "please don't index this" signal on every response — robots.txt
// below covers well-behaved crawlers at the crawl stage, this covers the
// (stronger, binding) indexing stage even for a URL a crawler only ever
// reaches via an external link. Neither actually stops a scraper that
// ignores both; that's not something HTTP-layer signals can do without
// adding a login wall, which the public pages are deliberately kept without.
app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("X-Robots-Tag", "noindex, nofollow");
  return payload;
});

app.get("/robots.txt", async (_request, reply) => {
  reply.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

app.get("/api/healthz", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

await app.register(authRoutes);
await app.register(playerRoutes);
await app.register(playerAccountRoutes);
await app.register(tournamentRoutes);
await app.register(podRoutes);
await app.register(roundRoutes);
await app.register(cardPullRoutes);
await app.register(hallOfFameRoutes);
await app.register(apiTokenRoutes);
await app.register(settingsRoutes);
await app.register(publicRoutes);
await app.register(trackingRoutes);

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
