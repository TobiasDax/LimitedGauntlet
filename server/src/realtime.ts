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
  findRoomOrganization(kind: RoomKind, resourceId: string): Promise<{ id: string; publicPasswordHash: string | null } | null>;
  // Also checks the session's authVersion against the account's current one —
  // the same invalidation `requireAuth`/`requireSessionAuth` (auth/middleware.ts)
  // apply to HTTP requests, so an OIDC subject relink (PI-49) or any other
  // session-revoking action also cuts off an already-open realtime subscription
  // rather than leaving it authorized on stale state.
  organizerSessionValid(organizerId: string, orgId: string, authVersion: number): Promise<boolean>;
}

export type RealtimeRoomAuthorizer = (room: unknown, cookieHeader: string | undefined) => Promise<boolean>;

const defaultAuthorizationStore: RealtimeAuthorizationStore = {
  async findRoomOrganization(kind, resourceId) {
    if (kind === "pod") {
      const pod = await prisma.pod.findUnique({
        where: { id: resourceId },
        select: { tournament: { select: { organization: { select: { id: true, publicPasswordHash: true } } } } },
      });
      return pod?.tournament.organization ?? null;
    }
    const tournament = await prisma.tournament.findUnique({
      where: { id: resourceId },
      select: { organization: { select: { id: true, publicPasswordHash: true } } },
    });
    return tournament?.organization ?? null;
  },
  async organizerSessionValid(organizerId, orgId, authVersion) {
    const organizer = await prisma.organizerAccount.findFirst({
      where: { id: organizerId, orgId },
      select: { authVersion: true },
    });
    return organizer !== null && organizer.authVersion === authVersion;
  },
};

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

    const unlockedOrgIds = session.get<unknown>("publicUnlocked");
    if (Array.isArray(unlockedOrgIds) && unlockedOrgIds.includes(organization.id)) return true;

    const organizerId = session.get<unknown>("organizerId");
    if (typeof organizerId !== "string") return false;
    const authVersion = session.get<unknown>("authVersion");
    return store.organizerSessionValid(organizerId, organization.id, typeof authVersion === "number" ? authVersion : 0);
  };
}

// Socket.IO is a separate protocol boundary, so Fastify route hooks do not run
// for room joins. Resolve every room to its organization here and apply the
// same session/public-lock policy before granting the read-only subscription.
export function initRealtime(httpServer: HttpServer, authorizeRoom: RealtimeRoomAuthorizer): SocketIOServer {
  io = new SocketIOServer(httpServer, { path: "/socket.io" });

  io.on("connection", (socket) => {
    socket.on("join", async (room: unknown, ack?: JoinAck) => {
      try {
        const allowed = await authorizeRoom(room, socket.handshake.headers.cookie);
        if (allowed && typeof room === "string") {
          await socket.join(room);
        }
        ack?.({ ok: allowed });
      } catch (err) {
        // A database/session failure must fail closed without taking down the
        // shared socket or revealing whether a resource exists.
        console.error("Realtime room authorization failed", err);
        ack?.({ ok: false });
      }
    });
    socket.on("leave", (room: unknown) => {
      if (typeof room === "string") socket.leave(room);
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
