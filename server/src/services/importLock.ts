// Shared guard across every organization-data importer (PI-38/39's own
// export format in orgImport.ts, and PI-39's legacy-data.json history format
// in legacyImport.ts): only one heavy, write-many import runs at a time,
// system-wide. This app's real usage is a single self-hosted instance with
// at most a handful of orgs, so one module-level flag (not per-org) is a
// deliberately simple choice, not a bottleneck at this scale.
export class ImportInProgressError extends Error {
  constructor() {
    super("An organization import is already running");
    this.name = "ImportInProgressError";
  }
}

let importInProgress = false;

export async function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
  if (importInProgress) throw new ImportInProgressError();
  importInProgress = true;
  try {
    return await fn();
  } finally {
    importInProgress = false;
  }
}
