import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { HallOfFameRow } from "../../lib/types";

// All-time player standings across every tournament in the org.
export function useHallOfFame() {
  return useQuery({
    queryKey: ["hall-of-fame"],
    queryFn: () => api.get<{ hallOfFame: HallOfFameRow[] }>("/hall-of-fame"),
  });
}
