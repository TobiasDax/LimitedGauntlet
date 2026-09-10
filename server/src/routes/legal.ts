import type { FastifyInstance } from "fastify";
import { config, configuredSsoProviders, isEmailConfigured } from "../config.js";
import { renderLegalDoc, type LegalDocInput } from "../legal/privacyPolicy.js";

// PI-112 — the built-in Impressum + privacy notice. Public, no auth (it is a
// legal disclosure that must be readable by anyone, including on a
// PI-27-locked deployment — this route sits outside that lock by design).
// Renders Markdown text only; the client turns it into DOM via <RichText>.
export async function legalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/legal", async (_request, reply) => {
    if (!config.legal.pageEnabled) {
      reply.send({ enabled: false, markdown: "", incomplete: false });
      return;
    }

    const analyticsProvider =
      config.legal.analyticsProvider.trim() || (config.tracking ? new URL(config.tracking.scriptUrl).host : "");

    const input: LegalDocInput = {
      controllerName: config.legal.controllerName,
      controllerAddress: config.legal.controllerAddress,
      controllerEmail: config.legal.controllerEmail,
      controllerPhone: config.legal.controllerPhone,
      registerInfo: config.legal.registerInfo,
      dpoContact: config.legal.dpoContact,
      lawfulBasis: config.legal.lawfulBasis,
      retentionTournaments: config.legal.retentionTournaments,
      retentionLogs: config.legal.retentionLogs,
      hostingProvider: config.legal.hostingProvider,
      supervisoryAuthority: config.legal.supervisoryAuthority,
      smtpProvider: config.legal.smtpProvider,
      analyticsProvider,
      lastUpdated: config.legal.lastUpdated,
      features: {
        email: isEmailConfigured(),
        analytics: config.tracking !== null,
        sso: configuredSsoProviders(),
        adminWebhook: config.adminWebhook !== null,
        requestLogKeepsIp: config.requestLog === "full",
      },
    };

    reply.send({ enabled: true, ...renderLegalDoc(input) });
  });
}
