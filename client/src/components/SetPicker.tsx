import { useScryfallSets } from "../features/pods/useCardPulls";
import { Field } from "./ui";

// The pod-level "default set" picker — only offered for DRAFT/SEALED pods
// (the formats where "everyone's opening the same set" is actually true).
// Backed by the server's cached list of main paper expansion/core sets;
// this is a convenience default, not a constraint — the add-pull form's
// own set field stays free-text so an unusual case (a bonus sheet, a
// promo) can still be entered even if it's not a "main" set.
export function SetPicker({ value, onChange }: { value: string; onChange: (setCode: string) => void }) {
  const { data } = useScryfallSets();
  const sets = data?.sets ?? [];

  return (
    <Field label="Default set" hint="Pre-fills the set on each card pull added to this pod — optional">
      <select
        className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">No default</option>
        {sets.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
