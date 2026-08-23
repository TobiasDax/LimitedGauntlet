import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";

const POD_EVENTS = [
  "pairings-published",
  "pairings-updated",
  "round-started",
  "round-extended",
  "round-completed",
  "result-submitted",
] as const;

// Joins this pod's realtime room and invalidates the relevant query
// caches whenever the server broadcasts a change — so every open tab
// (organizer's phone, a shared display, a player checking standings)
// updates without anyone hitting refresh. Broad invalidation
// (["pods", podId] covers pod detail + nested rounds/standings queries
// via TanStack's prefix matching) rather than one handler per event,
// since almost every one of these events plausibly changes standings.
export function usePodRealtime(podId: string | undefined, tournamentId?: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!podId) return;
    const socket = getSocket();
    const room = `pod:${podId}`;

    const onEvent = () => {
      queryClient.invalidateQueries({ queryKey: ["pods", podId] });
      if (tournamentId) {
        queryClient.invalidateQueries({ queryKey: ["tournaments", tournamentId] });
      }
    };

    socket.emit("join", room);
    for (const event of POD_EVENTS) socket.on(event, onEvent);

    return () => {
      for (const event of POD_EVENTS) socket.off(event, onEvent);
      socket.emit("leave", room);
    };
  }, [podId, tournamentId, queryClient]);
}
