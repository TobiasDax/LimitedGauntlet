import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";

// Org data export/import (PI-38 / PI-39). Export is a file download rather than
// a JSON fetch, so it doesn't go through the shared `api` client (which always
// parses the body as JSON) — it hits the endpoint directly and streams the
// response into a browser download. Import posts the parsed file back through
// the normal API.

export interface ExportSelection {
  data: boolean;
  hallOfFame: boolean;
  treasureVault: boolean;
}

export function useExportOrg() {
  return useMutation({
    mutationFn: async (selection: ExportSelection) => {
      const params = new URLSearchParams();
      if (selection.data) params.set("data", "1");
      if (selection.hallOfFame) params.set("hallOfFame", "1");
      if (selection.treasureVault) params.set("treasureVault", "1");

      const res = await fetch(`/api/settings/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new ApiError(res.status, body);
      }
      const blob = await res.blob();

      // Prefer the server's Content-Disposition filename; fall back to a sane default.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = match?.[1]?.replace(/\.json$/, `-${stamp}.json`) ?? `limited-gauntlet-export-${stamp}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export interface ImportSummary {
  tournamentsCreated: number;
  tournamentsSkipped: number;
  podsCreated: number;
  playersCreated: number;
}

// Thrown when the picked file isn't valid JSON at all (before it ever reaches
// the server). Server-side shape/format errors come back as ApiError.
export class InvalidFileError extends Error {
  constructor() {
    super("not_json");
  }
}

export function useImportOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new InvalidFileError();
      }
      return api.post<{ ok: true; summary: ImportSummary }>("/settings/import", payload);
    },
    // An import can touch almost everything (tournaments, standings, Hall of
    // Fame, Treasure Chest), so refetch the whole cache rather than guess keys.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
