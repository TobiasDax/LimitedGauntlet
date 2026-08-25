import "fastify";
import "@fastify/secure-session";

declare module "@fastify/secure-session" {
  interface SessionData {
    organizerId?: string;
    // Org ids whose public-page password lock (PI-27) this visitor has entered.
    publicUnlocked?: string[];
  }
}

declare module "fastify" {
  interface FastifyRequest {
    organizer?: {
      id: string;
      orgId: string;
      email: string;
      name: string;
    };
  }
}
