import type { Server as HttpServer } from "node:http";
import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "./prisma.js";

let io: SocketIOServer | null = null;

type RoomKind = "pod" | "tournament";
type JoinAck = (result: { ok: boolean }) => void;

interface RealtimeSession {
  get<T = unknown>(key: string): T | undefined;
}

interface RealtimeSessionCodec {
  parseCookie(header: string): Record<string, string | undefined>;
  decodeSecureSession(cookie: string): RealtimeSession | null;
}

interface RealtimeAuthorizationStore {
  findRoomOrganization(
    kind: RoomKind,
    resourceId: string,
  ): Promise<{ id: string; publicPasswordHash: string | null; publicLockVersion: number } | null>;
  // Also checks the session's authVersion against the account's current one —
  // the same invalidation `requireAuth`/`requireSessionAuth` (auth/middleware.ts)
  // apply to HTTP requests, so an OIDC subject relink (PI-49) or any other
  // session-revoking action also cuts off an already-open realtime subscription
  // rather than leaving it authorized on stale state.
  organizerSessionValid(organizerId: string, orgId: string, authVersion: number): Promise<boolean>;
  // Same idea for a self-service player session (PI-52) — a logged-in player of
  // the room's org may subscribe to a locked org's rooms, and a revoked account
  // (authVersion bumped) loses that subscription on reconnect.
  playerSessionValid(identityId: string, orgId: string, authVersion: number): Promise<boolean>;
}

export type RealtimeRoomAuthorizer = (room: unknown, cookieHeader: string | undefined) => Promise<boolean>;

const defaultAuthorizationStore: RealtimeAuthorizationStore = {
  async findRoomOrganization(kind, resourceId) {
    if (kind === "pod") {
      const pod = await prisma.pod.findUnique({
        where: { id: resourceId },
        select: {
          tournament: {
            select: { organization: { select: { id: true, publicPasswordHash: true, publicLockVersion: true } } },
          },
        },
      });
      return pod?.tournament.organization ?? null;
    }
    const tournament = await prisma.tournament.findUnique({
      where: { id: resourceId },
      select: { organization: { select: { id: true, publicPasswordHash: true, publicLockVersion: true } } },
    });
    return tournament?.organization ?? null;
  },
  async organizerSessionValid(organizerId, orgId, authVersion) {
    // PI-86 — a member of the org (any membership) with a matching authVersion.
    const [account, membership] = await Promise.all([
      prisma.organizerAccount.findUnique({ where: { id: organizerId }, select: { authVersion: true } }),
      prisma.organizerMembership.findUnique({
        where: { accountId_orgId: { accountId: organizerId, orgId } },
        select: { id: true },
      }),
    ]);
    return account !== null && membership !== null && account.authVersion === authVersion;
  },
  async playerSessionValid(identityId, orgId, authVersion) {
    // PI-86 — the identity has a Player row in this org and a matching authVersion.
    const [identity, player] = await Promise.all([
      prisma.playerIdentity.findUnique({ where: { id: identityId }, select: { authVersion: true } }),
      prisma.player.findFirst({ where: { identityId, orgId }, select: { id: true } }),
    ]);
    return identity !== null && player !== null && identity.authVersion === authVersion;
  },
};

// PI-123 — the join listener's second argument is untrusted client input, not
// a value TypeScript can actually guarantee is callable. Only invoke it once
// runtime-verified as a function, and never let the client's own callback
// throwing propagate back into the server's event loop.
function safeAck(ack: unknown, result: { ok: boolean }): void {
  if (typeof ack !== "function") return;
  try {
    (ack as JoinAck)(result);
  } catch (err) {
    console.error("Realtime join acknowledgment callback threw", err);
  }
}

function parseRoom(room: unknown): { kind: RoomKind; resourceId: string } | null {
  if (typeof room !== "string") return null;
  const match = /^(pod|tournament):([^:]+)$/.exec(room);
  if (!match) return null;
  return { kind: match[1] as RoomKind, resourceId: match[2]! };
}

export function createRealtimeRoomAuthorizer(
  sessionCodec: RealtimeSessionCodec,
  store: RealtimeAuthorizationStore = defaultAuthorizationStore,
): RealtimeRoomAuthorizer {
  return async (room, cookieHeader) => {
    const parsedRoom = parseRoom(room);
    if (!parsedRoom) return false;

    const organization = await store.findRoomOrganization(parsedRoom.kind, parsedRoom.resourceId);
    if (!organization) return false;
    if (!organization.publicPasswordHash) return true;
    if (!cookieHeader) return false;

    const cookie = sessionCodec.parseCookie(cookieHeader).session;
    if (!cookie) return false;
    const session = sessionCodec.decodeSecureSession(cookie);
    if (!session) return false;

    // PI-127 — a version-tagged grant, same shape and same reasoning as
    // routes/public.ts's getUnlockedOrgVersions(): rotating or disabling/
    // re-enabling the password must not leave an already-open (or freshly
    // reconnected) realtime subscription authorized on the old grant. A
    // legacy array-shaped session (from before this change) fails the
    // `typeof`/`Array.isArray` check below and correctly falls through to
    // requiring a fresh unlock.
    const unlockedVersions = session.get<unknown>("publicUnlocked");
    if (
      unlockedVersions &&
      typeof unlockedVersions === "object" &&
      !Array.isArray(unlockedVersions) &&
      (unlockedVersions as Record<string, number>)[organization.id] === organization.publicLockVersion
    ) {
      return true;
    }

    const organizerId = session.get<unknown>("organizerId");
    if (typeof organizerId === "string") {
      const authVersion = session.get<unknown>("authVersion");
      if (
        await store.organizerSessionValid(
          organizerId,
          organization.id,
          typeof authVersion === "number" ? authVersion : 0,
        )
      ) {
        return true;
      }
    }

    const playerIdentityId = session.get<unknown>("playerIdentityId");
    if (typeof playerIdentityId === "string") {
      const playerAuthVersion = session.get<unknown>("playerAuthVersion");
      return store.playerSessionValid(
        playerIdentityId,
        organization.id,
        typeof playerAuthVersion === "number" ? playerAuthVersion : 0,
      );
    }

    return false;
  };
}

// Socket.IO is a separate protocol boundary, so Fastify route hooks do not run
// for room joins. Resolve every room to its organization here and apply the
// same session/public-lock policy before granting the read-only subscription.
export function initRealtime(httpServer: HttpServer, authorizeRoom: RealtimeRoomAuthorizer): SocketIOServer {
  io = new SocketIOServer(httpServer, { path: "/socket.io" });

  io.on("connection", (socket) => {
    // PI-123 — `ack` is whatever the connected client sent, not necessarily a
    // function: the `?:` in the old `JoinAck` param type only checked for
    // undefined, not callability. A string/object/number here made `ack?.(...)`
    // throw — once in the try block, then again from the catch block's own
    // `ack?.(...)` call, uncaught, taking the shared HTTP+realtime process down
    // via Node's default unhandled-rejection behavior. Any anonymous client
    // reaches this, with any (even invalid) room name.
    socket.on("join", (room: unknown, ack?: unknown) => {
      void handleJoin(room, ack).catch((err: unknown) => {
        // Belt-and-braces: handleJoin already catches everything it can, but
        // an event listener's returned promise must never reject uncaught.
        console.error("Unexpected error in realtime join handler", err);
        safeAck(ack, { ok: false });
      });
    });

    async function handleJoin(room: unknown, ack: unknown): Promise<void> {
      try {
        const allowed = await authorizeRoom(room, socket.handshake.headers.cookie);
        if (allowed && typeof room === "string") {
          await socket.join(room);
        }
        safeAck(ack, { ok: allowed });
      } catch (err) {
        // A database/session failure must fail closed without taking down the
        // shared socket or revealing whether a resource exists.
        console.error("Realtime room authorization failed", err);
        safeAck(ack, { ok: false });
      }
    }
    socket.on("leave", (room: unknown) => {
      if (typeof room === "string") void socket.leave(room);
    });
  });

  return io;
}

export function createAppRealtimeRoomAuthorizer(app: FastifyInstance): RealtimeRoomAuthorizer {
  return createRealtimeRoomAuthorizer({
    parseCookie: (header) => app.parseCookie(header),
    decodeSecureSession: (cookie) => app.decodeSecureSession(cookie),
  });
}

// The secure-session cookie is captured during the Socket.IO handshake. When
// an organizer changes the public-lock policy, reconnect every client so room
// joins are re-evaluated against the new database state and a fresh cookie.
// Lock changes are rare; a global reconnect is safer than maintaining a second
// resource-to-socket authorization index that could itself drift.
export function refreshRealtimeAuthorization(): void {
  io?.disconnectSockets(true);
}

export function emitPodEvent(podId: string, event: string, _payload: unknown): void {
  // Clients use realtime events only to invalidate and refetch through the
  // authorized HTTP API. Do not duplicate database records on this channel.
  io?.to(`pod:${podId}`).emit(event, { podId });
}

export function emitTournamentEvent(tournamentId: string, event: string, _payload: unknown): void {
  io?.to(`tournament:${tournamentId}`).emit(event, { tournamentId });
}
