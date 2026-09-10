import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import {
  getPlayerTokenLedger,
  isTokensEnabled,
  recordManualTokenTxn,
  TokensDisabledError,
} from "../services/tokens.js";
import { anonymisePlayer, rosterNameTaken, setPlayerPublicHidden } from "../services/playerPrivacy.js";
import { buildPlayerDataExport, playerExportFilename } from "../services/playerDataExport.js";

const playerSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

const paramsSchema = z.object({ id: z.string().min(1) });

const nameTaken = rosterNameTaken;

// Never send the login credentials (PI-52) back to the client — the roster
// only cares whether an account exists, exposed as `hasAccount` on the list.
// PI-86 — the login lives on the linked PlayerIdentity now; a linked
// `identityId` means the roster entry has a self-service account.
// PI-104/107 — the two privacy timestamps are surfaced as plain booleans so
// the roster UI can badge an anonymised / publicly-hidden row.
function publicPlayer<
  T extends {
    identityId: string | null;
    email: string | null;
    anonymisedAt: Date | null;
    publicHiddenAt: Date | null;
  },
>(player: T) {
  // Credentials + raw timestamps destructured out of the public shape.
  const { identityId, email: _email, anonymisedAt, publicHiddenAt, ...rest } = player;
  return {
    ...rest,
    hasAccount: identityId !== null,
    anonymised: anonymisedAt !== null,
    // PI-110 — `publicHidden` is the switch state; `publicAlias` (kept on the
    // row) is the handle shown publicly, surfaced so the roster can display it.
    publicHidden: publicHiddenAt !== null,
  };
}

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/players", async (request, reply) => {
    const rows = await prisma.player.findMany({
      where: { orgId: request.organizer!.orgId },
      orderBy: { displayName: "asc" },
      include: {
        _count: { select: { playerInvites: { where: { usedAt: null, expiresAt: { gt: new Date() } } } } },
      },
    });
    // Never leak the hash or the login email over the wire — the roster UI
    // only needs to know whether an account / pending invite exists (PI-52).
    const players = rows.map(({ _count, ...p }) => ({
      ...publicPlayer(p),
      pendingInvite: _count.playerInvites > 0,
    }));
    reply.send({ players });
  });

  app.post("/api/players", async (request, reply) => {
    const parsed = playerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
      return;
    }

    if (await nameTaken(request.organizer!.orgId, parsed.data.displayName)) {
      reply.code(409).send({ error: "name_taken" });
      return;
    }

    const player = await prisma.player.create({
      data: { orgId: request.organizer!.orgId, displayName: parsed.data.displayName },
    });
    reply.code(201).send({ player: publicPlayer(player) });
  });

  app.patch("/api/players/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = playerSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    if (await nameTaken(request.organizer!.orgId, body.data.displayName, params.data.id)) {
      reply.code(409).send({ error: "name_taken" });
      return;
    }

    // updateMany scoped by orgId (not a plain `update` by id) so a
    // request can never mutate another organization's player — that
    // check is the entire point, not an optimization.
    const { count } = await prisma.player.updateMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
      data: { displayName: body.data.displayName },
    });

    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const player = await prisma.player.findUniqueOrThrow({ where: { id: params.data.id } });
    reply.send({ player: publicPlayer(player) });
  });

  app.delete("/api/players/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const { count } = await prisma.player.deleteMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });

    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    reply.code(204).send();
  });

  // --- GDPR data-subject rights (PI-104 / PI-105 / PI-107) -----------------

  // PI-104 — anonymise a roster entry (Art. 17 erasure that keeps the
  // competitive record intact). Irreversible; the plain DELETE above stays for
  // genuine mistakes. Idempotent — a second call is a no-op.
  app.post("/api/players/:id/anonymise", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const result = await anonymisePlayer(request.organizer!.orgId, params.data.id);
    if (!result) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const player = await prisma.player.findUniqueOrThrow({ where: { id: result.id } });
    reply.send({ player: publicPlayer(player), alreadyAnonymised: result.alreadyAnonymised });
  });

  // PI-107 — set/clear the "hide from public pages" objection flag (Art. 21).
  app.post("/api/players/:id/public-visibility", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = z.object({ hidden: z.boolean() }).safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const updated = await setPlayerPublicHidden(request.organizer!.orgId, params.data.id, body.data.hidden);
    if (!updated) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const player = await prisma.player.findUniqueOrThrow({ where: { id: updated.id } });
    reply.send({ player: publicPlayer(player) });
  });

  // PI-105 — a single player's own data (Art. 15 access / Art. 20
  // portability), pulled by an organizer. The player-self version is
  // GET /api/player/export in routes/playerAccounts.ts.
  app.get("/api/players/:id/export", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const doc = await buildPlayerDataExport(request.organizer!.orgId, params.data.id);
    if (!doc) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply
      .header("content-disposition", `attachment; filename="${playerExportFilename(doc.player.displayName)}"`)
      .send(doc);
  });

  // --- Tokens (PI-72) — organizer view + manual adjustments -----------------

  app.get("/api/players/:id/token-ledger", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const orgId = request.organizer!.orgId;
    const player = await prisma.player.findFirst({ where: { id: params.data.id, orgId }, select: { id: true } });
    if (!player) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (!(await isTokensEnabled(orgId))) {
      reply.code(404).send({ error: "tokens_disabled" });
      return;
    }
    reply.send(await getPlayerTokenLedger(orgId, player.id));
  });

  app.post("/api/players/:id/token-adjust", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = z
      .object({
        delta: z.number().int().optional(),
        setTo: z.number().int().optional(),
        note: z.string().trim().max(300).optional(),
        initial: z.boolean().optional(),
      })
      .refine((b) => (b.delta === undefined) !== (b.setTo === undefined), "exactly one of delta / setTo")
      .safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    try {
      const result = await recordManualTokenTxn(
        request.organizer!.orgId,
        params.data.id,
        request.organizer!.id,
        body.data,
      );
      reply.send(result);
    } catch (err) {
      if (err instanceof TokensDisabledError) {
        reply.code(409).send({ error: "tokens_disabled" });
        return;
      }
      if (err instanceof Error && err.message === "player_not_found") {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      throw err;
    }
  });
}
