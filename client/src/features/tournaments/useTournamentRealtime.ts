import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";

// Gesamtwertung reflects every pod's results, so it joins the
// tournament-wide room rather than any one pod's — the server emits
// "standings-changed" there whenever a result or round-completion in
// any of the tournament's pods could move the rankings.
export function useTournamentRealtime(tournamentId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tournamentId) return;
    const socket = getSocket();
    const room = `tournament:${tournamentId}`;

    const onEvent = () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(tournamentId) });
    };

    const joinRoom = () => socket.emit("join", room);
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    socket.on("standings-changed", onEvent);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("standings-changed", onEvent);
      socket.emit("leave", room);
    };
  }, [tournamentId, queryClient]);
}
