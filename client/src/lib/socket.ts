import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// One shared connection for the whole app — pages join/leave rooms as
// they mount/unmount rather than each opening their own socket.
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io" });
  }
  return socket;
}
