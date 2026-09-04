import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";

const POD_EVENTS = [
  "pairings-published",
  "pairings-updated",
  "pairings-revealed",
  "round-started",
  "round-extended",
  "round-completed",
  "round-unpaired",
  "result-submitted",
  "prep-timer-updated",
] as const;

// Joins this pod's realtime room and invalidates the relevant query
// caches whenever the server broadcasts a change — so every open tab
// (organizer's phone, a shared display, a player checking standings)
// updates without anyone hitting refresh. Matches by predicate (any
// query key that contains the pod/tournament id) rather than a fixed
// prefix, since both the authenticated ["pods", id, ...] keys and the
// public ["public", "pods", id, ...] keys need to react to the same
// broadcast — one pod, two possible viewers.
export function usePodRealtime(podId: string | undefined, tournamentId?: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!podId) return;
    const socket = getSocket();
    const room = `pod:${podId}`;

    const onEvent = () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(podId) });
      if (tournamentId) {
        queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(tournamentId) });
      }
    };

    const joinRoom = () => socket.emit("join", room);
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    for (const event of POD_EVENTS) socket.on(event, onEvent);

    return () => {
      socket.off("connect", joinRoom);
      for (const event of POD_EVENTS) socket.off(event, onEvent);
      socket.emit("leave", room);
    };
  }, [podId, tournamentId, queryClient]);
}
