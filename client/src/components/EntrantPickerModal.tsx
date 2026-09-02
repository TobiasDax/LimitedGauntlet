import { useMemo, useState } from "react";
import { usePlayers } from "../features/players/usePlayers";
import { useAddEntrantsBulk, entrantErrorMessage } from "../features/pods/useEntrants";
import { Button, FormError, Modal, TextField } from "./ui";

const norm = (s: string) => s.trim().toLowerCase();

// PI-64/65 — add players to an individual pod in one pass: a checklist of the
// whole roster (already-entered players shown ticked + disabled), a
// select-all/clear toggle, and an inline "new player" field that creates the
// player on the roster and adds them here in the same request.
export function EntrantPickerModal({
  podId,
  podName,
  enteredPlayerIds,
  onClose,
}: {
  podId: string;
  podName: string;
  enteredPlayerIds: Set<string>;
  onClose: () => void;
}) {
  const { data } = usePlayers();
  const add = useAddEntrantsBulk(podId);
  const roster = data?.players ?? [];

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newNames, setNewNames] = useState<string[]>([]);
  const [newInput, setNewInput] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  const selectable = useMemo(() => roster.filter((p) => !enteredPlayerIds.has(p.id)), [roster, enteredPlayerIds]);
  const allSelected = selectable.length > 0 && selectable.every((p) => checked.has(p.id));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addNewName = () => {
    const name = newInput.trim();
    if (!name) return;
    if (roster.some((p) => norm(p.displayName) === norm(name))) {
      setNewError(`"${name}" is already on the roster — tick them in the list instead.`);
      return;
    }
    if (newNames.some((n) => norm(n) === norm(name))) {
      setNewError(`You've already added "${name}".`);
      return;
    }
    setNewNames((prev) => [...prev, name]);
    setNewInput("");
    setNewError(null);
  };

  const total = checked.size + newNames.length;

  return (
    <Modal title={`Add players to ${podName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink-muted">
            {selectable.length === 0 ? "Everyone's already in this pod" : `${selectable.length} available`}
          </span>
          {selectable.length > 0 && (
            <button
              type="button"
              className="text-[12px] text-link hover:text-link-strong"
              onClick={() => setChecked(allSelected ? new Set() : new Set(selectable.map((p) => p.id)))}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {roster.length === 0 && <p className="px-3 py-3 text-[13px] text-ink-muted">The roster is empty.</p>}
          {roster.map((p) => {
            const entered = enteredPlayerIds.has(p.id);
            return (
              <label
                key={p.id}
                className={`flex items-center gap-2.5 px-3 py-2 text-[14px] ${entered ? "text-ink-muted" : "cursor-pointer hover:bg-surface-raised"}`}
              >
                <input
                  type="checkbox"
                  checked={entered || checked.has(p.id)}
                  disabled={entered}
                  onChange={() => toggle(p.id)}
                  className="accent-accent"
                />
                <span className="flex-1 font-medium">{p.displayName}</span>
                {entered && <span className="text-[11px] tracking-wide uppercase">In pod</span>}
              </label>
            );
          })}
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-secondary">New player</div>
          {newNames.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {newNames.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-1 text-[12px]">
                  {n}
                  <button
                    type="button"
                    onClick={() => setNewNames((prev) => prev.filter((x) => x !== n))}
                    className="text-ink-muted hover:text-critical"
                    aria-label={`Remove ${n}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <TextField
              className="flex-1"
              placeholder="Name — added to the roster too"
              value={newInput}
              onChange={(e) => {
                setNewInput(e.target.value);
                setNewError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewName();
                }
              }}
            />
            <Button type="button" variant="ghost" onClick={addNewName} disabled={!newInput.trim()}>
              Add
            </Button>
          </div>
          {newError && <p className="mt-1.5 text-[12px] text-critical">{newError}</p>}
        </div>

        {add.isError && <FormError>{entrantErrorMessage(add.error)}</FormError>}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={total === 0 || add.isPending}
            onClick={() =>
              add.mutate(
                { playerIds: [...checked], newPlayerNames: newNames },
                { onSuccess: onClose },
              )
            }
          >
            {add.isPending ? "Adding…" : total === 0 ? "Add players" : `Add ${total} player${total === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
