import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

// Rooms are just "pod:<id>" / "tournament:<id>" — anyone who knows the id
// can join, same trust model as the public read-only HTTP pages (an
// unguessable cuid is the access control, not a login). Sockets here are
// read-only subscriptions; all actual mutations still go through the
// authenticated HTTP API, this layer only broadcasts what already
// happened.
export function initRealtime(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, { path: "/socket.io" });

  io.on("connection", (socket) => {
    socket.on("join", (room: unknown) => {
      if (typeof room === "string" && (room.startsWith("pod:") || room.startsWith("tournament:"))) {
        socket.join(room);
      }
    });
    socket.on("leave", (room: unknown) => {
      if (typeof room === "string") socket.leave(room);
    });
  });

  return io;
}

export function emitPodEvent(podId: string, event: string, payload: unknown): void {
  io?.to(`pod:${podId}`).emit(event, payload);
}

export function emitTournamentEvent(tournamentId: string, event: string, payload: unknown): void {
  io?.to(`tournament:${tournamentId}`).emit(event, payload);
}
