import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";

const EVENTS = ["round-started", "round-completed", "round-unpaired", "result-submitted", "pairings-published"] as const;

// Keeps the player portal's "Your matches" list live (PI-52): joins each pod
// room the player currently has an open match in, and refetches the portal
// payload whenever the round or a result changes — so an opponent's entry
// shows up without a manual refresh.
export function usePlayerPortalRealtime(podIds: string[]): void {
  const queryClient = useQueryClient();
  const key = podIds.slice().sort().join(",");

  useEffect(() => {
    if (!key) return;
    const socket = getSocket();
    const rooms = key.split(",");

    const onEvent = () => queryClient.invalidateQueries({ queryKey: ["player", "portal"] });
    const joinAll = () => rooms.forEach((id) => socket.emit("join", `pod:${id}`));

    if (socket.connected) joinAll();
    socket.on("connect", joinAll);
    for (const event of EVENTS) socket.on(event, onEvent);

    return () => {
      socket.off("connect", joinAll);
      for (const event of EVENTS) socket.off(event, onEvent);
      rooms.forEach((id) => socket.emit("leave", `pod:${id}`));
    };
  }, [key, queryClient]);
}
