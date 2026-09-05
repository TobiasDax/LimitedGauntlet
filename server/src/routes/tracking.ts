import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { proxyTrackingScript, proxyTrackingSend } from "../services/tracking.js";

// PI-85 follow-up — same-origin proxy for the deployer's analytics script +
// collect endpoint. See services/tracking.ts for why. Not registered at all
// (not just inert) when TRACKING_* isn't configured — GET /stats.js and
// POST /api/send then fall through to the SPA/404 handling like any other
// unmatched route.
export async function trackingRoutes(app: FastifyInstance): Promise<void> {
  if (!config.tracking) return;
  const { scriptUrl } = config.tracking;
  const upstreamOrigin = new URL(scriptUrl).origin;

  app.get("/stats.js", async (_request, reply) => {
    const { status, contentType, body } = await proxyTrackingScript(scriptUrl);
    // Only cache a genuine success — an unconditional cache-control here
    // would have a transient upstream error (Umami restarting, briefly
    // misconfigured) cached by the browser and any CDN in front of this app
    // for the full hour, keeping the tracker broken long after upstream
    // recovers.
    const cacheControl = status >= 200 && status < 300 ? "public, max-age=3600" : "no-store";
    reply.code(status).header("content-type", contentType).header("cache-control", cacheControl).send(Buffer.from(body));
  });

  app.post("/api/send", async (request, reply) => {
    const { status, contentType, body } = await proxyTrackingSend(upstreamOrigin, JSON.stringify(request.body), {
      contentType: request.headers["content-type"],
      userAgent: request.headers["user-agent"],
      forwardedFor: request.ip,
    });
    reply.code(status).header("content-type", contentType).send(body);
  });
}
