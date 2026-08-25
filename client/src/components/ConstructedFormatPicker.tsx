import { constructedFormatLabel } from "../features/pods/usePods";
import type { ConstructedFormat } from "../lib/types";
import { Field, TextField } from "./ui";

const constructedFormats: ConstructedFormat[] = [
  "STANDARD",
  "MODERN",
  "LEGACY",
  "VINTAGE",
  "PIONEER",
  "PRE_MODERN",
  "PAUPER",
  "CUSTOM",
];

// Only offered for CONSTRUCTED pods — which constructed format was played.
// Picking "Custom" reveals a free-text field for a format this list
// doesn't cover (e.g. Canadian Highlander, Old School).
export function ConstructedFormatPicker({
  value,
  customValue,
  onChange,
  onCustomChange,
}: {
  value: ConstructedFormat | "";
  customValue: string;
  onChange: (format: ConstructedFormat | "") => void;
  onCustomChange: (name: string) => void;
}) {
  return (
    <Field label="Constructed format" hint="Optional">
      <div className="flex flex-col gap-2">
        <select
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={value}
          onChange={(e) => onChange(e.target.value as ConstructedFormat | "")}
        >
          <option value="">Not specified</option>
          {constructedFormats.map((f) => (
            <option key={f} value={f}>
              {constructedFormatLabel[f]}
            </option>
          ))}
        </select>
        {value === "CUSTOM" && (
          <TextField
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="e.g. Canadian Highlander"
            maxLength={60}
          />
        )}
      </div>
    </Field>
  );
}
