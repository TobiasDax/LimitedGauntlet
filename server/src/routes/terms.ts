import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { renderTerms } from "../legal/terms.js";

// HI-10 — the hosted instance's Terms of Service. Public, no auth, and outside
// the PI-27 public-password lock for the same reason /api/legal is. Answers
// `enabled: false` on a self-hosted deployment, which sells nothing and so
// publishes no terms.
export async function termsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/terms", async (_request, reply) => {
    if (!config.hostedEntitlements.enforced) {
      reply.send({ enabled: false, markdown: "", incomplete: false });
      return;
    }
    reply.send({
      enabled: true,
      ...renderTerms({
        operatorName: config.legal.controllerName,
        operatorAddress: config.legal.controllerAddress,
        supportEmail: config.hostedEntitlements.supportEmail,
        legalPageEnabled: config.legal.pageEnabled,
      }),
    });
  });
}
