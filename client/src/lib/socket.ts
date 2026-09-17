import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// One shared connection for the whole app — pages join/leave rooms as
// they mount/unmount rather than each opening their own socket.
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io" });
    // PI-132 — the server calls disconnectSockets(true) whenever a public
    // lock or an organizer's password changes (refreshRealtimeAuthorization,
    // PI-127/128), so every open tab can re-check its authorization. The
    // client SDK's default auto-reconnect deliberately does NOT cover this
    // case: a server-initiated disconnect ("io server disconnect") is
    // treated as intentional, and the manager will not retry on its own —
    // reconnecting is on us, or these tabs would stay dark until reloaded.
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") socket?.connect();
    });
  }
  return socket;
}
