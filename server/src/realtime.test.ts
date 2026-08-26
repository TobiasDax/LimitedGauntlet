import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as createClient } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";
import { createRealtimeRoomAuthorizer, emitPodEvent, initRealtime } from "./realtime.js";

function session(values: Record<string, unknown>) {
  return { get: <T>(key: string) => values[key] as T | undefined };
}

function fixture(options?: {
  locked?: boolean;
  sessionValues?: Record<string, unknown>;
  organizerMatches?: boolean;
  resourceExists?: boolean;
}) {
  const parseCookie = vi.fn(() => ({ session: "encoded" }));
  const decodeSecureSession = vi.fn(() =>
    options?.sessionValues === undefined ? null : session(options.sessionValues),
  );
  const findRoomOrganization = vi.fn(async () =>
    options?.resourceExists === false
      ? null
      : { id: "org-1", publicPasswordHash: options?.locked === false ? null : "hash" },
  );
  const organizerBelongsToOrganization = vi.fn(async () => options?.organizerMatches ?? false);
  const authorize = createRealtimeRoomAuthorizer(
    { parseCookie, decodeSecureSession },
    { findRoomOrganization, organizerBelongsToOrganization },
  );
  return { authorize, parseCookie, decodeSecureSession, findRoomOrganization, organizerBelongsToOrganization };
}

describe("realtime room authorization", () => {
  it("enforces authorization at the Socket.IO join boundary and emits minimal payloads", async () => {
    const httpServer = createServer();
    const socketServer = initRealtime(httpServer, async (room) => room === "pod:allowed");
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const client = createClient(`http://127.0.0.1:${port}`, { path: "/socket.io", transports: ["websocket"] });

    try {
      await new Promise<void>((resolve) => client.once("connect", resolve));
      const denied = await new Promise<{ ok: boolean }>((resolve) => client.emit("join", "pod:denied", resolve));
      expect(denied).toEqual({ ok: false });
      expect(socketServer.sockets.adapter.rooms.has("pod:denied")).toBe(false);

      const allowed = await new Promise<{ ok: boolean }>((resolve) => client.emit("join", "pod:allowed", resolve));
      expect(allowed).toEqual({ ok: true });
      expect(socketServer.sockets.adapter.rooms.get("pod:allowed")).toContain(client.id);

      const payload = new Promise<unknown>((resolve) => client.once("result-submitted", resolve));
      emitPodEvent("allowed", "result-submitted", { match: { secret: "must-not-cross-realtime" } });
      await expect(payload).resolves.toEqual({ podId: "allowed" });
    } finally {
      client.close();
      await socketServer.close();
    }
  });

  it("allows anonymous access to an existing organization without a public lock", async () => {
    const { authorize, decodeSecureSession } = fixture({ locked: false });
    await expect(authorize("pod:pod-1", undefined)).resolves.toBe(true);
    expect(decodeSecureSession).not.toHaveBeenCalled();
  });

  it("denies locked rooms without a valid session", async () => {
    const { authorize } = fixture();
    await expect(authorize("pod:pod-1", undefined)).resolves.toBe(false);
    await expect(authorize("tournament:t-1", "session=bad")).resolves.toBe(false);
  });

  it("allows a locked room after that organization was publicly unlocked", async () => {
    const { authorize } = fixture({ sessionValues: { publicUnlocked: ["org-1"] } });
    await expect(authorize("pod:pod-1", "session=good")).resolves.toBe(true);
  });

  it("allows a current organizer only for their own locked organization", async () => {
    const own = fixture({ sessionValues: { organizerId: "organizer-1" }, organizerMatches: true });
    await expect(own.authorize("tournament:t-1", "session=good")).resolves.toBe(true);
    expect(own.organizerBelongsToOrganization).toHaveBeenCalledWith("organizer-1", "org-1");

    const other = fixture({ sessionValues: { organizerId: "organizer-2" }, organizerMatches: false });
    await expect(other.authorize("tournament:t-1", "session=good")).resolves.toBe(false);
  });

  it("denies malformed and nonexistent rooms without decoding a session", async () => {
    const { authorize, decodeSecureSession, findRoomOrganization } = fixture({ sessionValues: { publicUnlocked: ["org-1"] } });
    for (const room of [undefined, "", "pod:", "pod:a:b", "other:pod-1"]) {
      await expect(authorize(room, "session=good")).resolves.toBe(false);
    }
    expect(findRoomOrganization).not.toHaveBeenCalled();
    expect(decodeSecureSession).not.toHaveBeenCalled();

    const missing = fixture({ resourceExists: false, sessionValues: { publicUnlocked: ["org-1"] } });
    await expect(missing.authorize("pod:missing", "session=good")).resolves.toBe(false);
    expect(missing.decodeSecureSession).not.toHaveBeenCalled();
  });

  it("re-evaluates the current lock state on every join", async () => {
    let locked = false;
    const authorize = createRealtimeRoomAuthorizer(
      { parseCookie: () => ({}), decodeSecureSession: () => null },
      {
        findRoomOrganization: async () => ({ id: "org-1", publicPasswordHash: locked ? "hash" : null }),
        organizerBelongsToOrganization: async () => false,
      },
    );

    await expect(authorize("pod:pod-1", undefined)).resolves.toBe(true);
    locked = true;
    await expect(authorize("pod:pod-1", undefined)).resolves.toBe(false);
  });
});
