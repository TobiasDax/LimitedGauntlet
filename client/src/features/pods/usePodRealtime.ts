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
  // PI-100 — an on-demand pod's roster changed because another pod started
  // (auto-withdraw) or was un-paired (restore).
  "entrants-changed",
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

    const refetchPageData = () => {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(podId) });
      if (tournamentId) {
        void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(tournamentId) });
      }
    };

    // PI-132 — socket.ts reconnects automatically after the server forces a
    // disconnect (a public lock or password change), but the server has no
    // memory of which rooms a now-closed socket used to be in, so every
    // reconnect must rejoin. The join can also now fail (this visitor's old
    // unlock grant no longer matches a rotated lock version) — the ack is
    // the only way to tell "authorized, just reconnected" apart from
    // "silently receiving nothing forever."
    const joinRoom = (isReconnect: boolean) => {
      socket.emit("join", room, (result?: { ok: boolean }) => {
        if (result?.ok === false) {
          // No longer authorized for this room — let the public layout's
          // lock-status check re-prompt instead of leaving this tab stuck.
          void queryClient.invalidateQueries({ queryKey: ["public", "lock"] });
          return;
        }
        // A reconnect implies a gap during which this room's broadcasts
        // were missed — refetch once to cover it. The very first join
        // doesn't need this: the page's own initial queries already
        // fetched current data.
        if (isReconnect) refetchPageData();
      });
    };
    if (socket.connected) joinRoom(false);
    const onConnect = () => joinRoom(true);
    socket.on("connect", onConnect);
    for (const event of POD_EVENTS) socket.on(event, refetchPageData);

    return () => {
      socket.off("connect", onConnect);
      for (const event of POD_EVENTS) socket.off(event, refetchPageData);
      socket.emit("leave", room);
    };
  }, [podId, tournamentId, queryClient]);
}
