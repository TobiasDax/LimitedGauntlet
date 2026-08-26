import { useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import {
  useExportOrg,
  useImportOrg,
  InvalidFileError,
  type ExportSelection,
  type ImportSummary,
} from "../../features/dataTransfer/useDataTransfer";
import { Button, Card, FormError, Modal } from "../ui";

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "request_failed";
}

function importErrorText(err: unknown): string {
  if (err instanceof InvalidFileError) return "That file isn't valid JSON.";
  const code = codeOf(err);
  switch (code) {
    case "not_our_format":
      return "That doesn't look like a LimitedGauntlet export file.";
    case "invalid_shape":
      return "This export file is malformed and can't be imported.";
    case "unsupported_version":
      return "This export was made by a newer version of LimitedGauntlet than this one can read.";
    case "no_data":
      return "This export has no tournament data to import (it was exported without the data section).";
    case "import_too_large":
      return "This export is too large to import safely. Split it into smaller exports and try again.";
    case "import_in_progress":
      return "Another import is already running. Wait for it to finish, then try again.";
    case "import_failed":
      return "Import failed — the file references data that doesn't line up. No changes were saved.";
    default:
      return "Import failed.";
  }
}

const EXPORT_OPTIONS: { key: keyof ExportSelection; label: string; description: string }[] = [
  {
    key: "data",
    label: "Tournaments, pods & matches",
    description: "The full structural data — players, tournaments, pods, entrants, rounds, matches, and card pulls. This is what an import reads back in.",
  },
  { key: "hallOfFame", label: "Hall of Fame", description: "The all-time player leaderboard snapshot." },
  { key: "treasureVault", label: "Treasure Vault", description: "The ranked card-pull value list snapshot." },
];

// Export / Import section (PI-38 / PI-39). Export opens a popup to choose which
// sections to include; import lands here later.
export function ExportImportSection() {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<ExportSelection>({ data: true, hallOfFame: true, treasureVault: true });
  const exportOrg = useExportOrg();

  const importOrg = useImportOrg();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportSummary | null>(null);

  const nothingSelected = !selection.data && !selection.hallOfFame && !selection.treasureVault;
  const errorText = exportOrg.isError ? `Export failed (${codeOf(exportOrg.error)}).` : null;

  return (
    <div>
      <Card className="mb-4 p-5">
        <p className="mb-4 text-[13.5px] text-ink-secondary">
          Download a machine-readable copy of your organization's data — for a backup, or to move it to another
          LimitedGauntlet instance.
        </p>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Export data…
        </Button>
      </Card>

      <Card className="p-5">
        <p className="mb-1 font-display text-[15px] font-bold">Import</p>
        <p className="mb-4 text-[13.5px] text-ink-secondary">
          Load a LimitedGauntlet export file into this organization. Tournaments already here (matched by name) are left
          untouched, so re-importing is safe.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (!file) return;
            setImported(null);
            importOrg.mutate(file, { onSuccess: (res) => setImported(res.summary) });
          }}
        />
        <Button variant="default" disabled={importOrg.isPending} onClick={() => fileRef.current?.click()}>
          {importOrg.isPending ? "Importing…" : "Choose file to import…"}
        </Button>
        {importOrg.isError && <FormError>{importErrorText(importOrg.error)}</FormError>}
        {imported && (
          <p className="mt-3 text-[13px] text-good">
            Imported {imported.tournamentsCreated} tournament{imported.tournamentsCreated === 1 ? "" : "s"} (
            {imported.podsCreated} pod{imported.podsCreated === 1 ? "" : "s"}, {imported.playersCreated} new player
            {imported.playersCreated === 1 ? "" : "s"})
            {imported.tournamentsSkipped > 0 && `, skipped ${imported.tournamentsSkipped} already present`}.
          </p>
        )}
      </Card>

      {open && (
        <Modal title="Export data" onClose={() => setOpen(false)}>
          <p className="mb-4 text-[13.5px] text-ink-secondary">Choose what to include in the export file.</p>
          <div className="mb-5 flex flex-col gap-3">
            {EXPORT_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-accent"
                  checked={selection[opt.key]}
                  onChange={(e) => setSelection((s) => ({ ...s, [opt.key]: e.target.checked }))}
                />
                <span>
                  <span className="block text-[14px] font-semibold text-ink">{opt.label}</span>
                  <span className="block text-[12px] text-ink-muted">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
          {errorText && <FormError>{errorText}</FormError>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={nothingSelected || exportOrg.isPending}
              onClick={() =>
                exportOrg.mutate(selection, {
                  onSuccess: () => setOpen(false),
                })
              }
            >
              {exportOrg.isPending ? "Preparing…" : "Download"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
