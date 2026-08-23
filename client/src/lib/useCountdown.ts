import { useEffect, useState } from "react";

export interface Countdown {
  remainingMs: number;
  formatted: string;
  expired: boolean;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Ticks locally from a fixed end timestamp rather than polling the
// server — resilient to flaky wifi, and every viewer's clock converges
// on the same number without any server chatter beyond the initial
// endsAt (which itself arrives via a socket broadcast on round-started
// / round-extended).
export function useCountdown(endsAt: string | null): Countdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (!endsAt) {
    return { remainingMs: 0, formatted: "—:—", expired: false };
  }

  const remainingMs = new Date(endsAt).getTime() - now;
  return { remainingMs, formatted: format(remainingMs), expired: remainingMs <= 0 };
}
