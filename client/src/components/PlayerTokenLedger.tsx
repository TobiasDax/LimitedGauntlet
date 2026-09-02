import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { TokenLedger, TokenLedgerEntry } from "../lib/types";
import { Button, Card, FormError, TextField } from "./ui";

type AdjustMutation = UseMutationResult<{ balance: number }, unknown, { delta?: number; setTo?: number; note?: string }>;

function reasonLabel(t: TokenLedgerEntry): string {
  switch (t.reason) {
    case "POD_PARTICIPATION":
      return t.podName ? `${t.podName} — participation` : "Participation";
    case "POD_STANDING":
      return t.podName ? `${t.podName} — finishing place` : "Finishing place";
    case "INITIAL":
      return t.organizerName ? `Starting balance · ${t.organizerName}` : "Starting balance";
    default:
      return t.organizerName ? `Manual · ${t.organizerName}` : "Manual";
  }
}

// PI-72 — a player's token balance + ledger. `adjust` present = organizer view
// (shows the add/deduct/set form); absent = read-only (the player's own portal).
export function PlayerTokenLedger({ ledger, adjust }: { ledger: TokenLedger; adjust?: AdjustMutation }) {
  const [mode, setMode] = useState<"add" | "deduct" | "set">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    setLocalError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || (mode !== "set" && n <= 0) || (mode === "set" && n < 0)) {
      setLocalError("Enter a valid amount.");
      return;
    }
    const input =
      mode === "set"
        ? { setTo: Math.round(n), note: note.trim() || undefined }
        : { delta: (mode === "deduct" ? -1 : 1) * Math.round(n), note: note.trim() || undefined };
    adjust!.mutate(input, {
      onSuccess: () => {
        setAmount("");
        setNote("");
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="text-[11px] tracking-wide text-ink-muted uppercase">Token balance</div>
        <div className="font-display text-[32px] font-bold tabular-nums">{ledger.balance}</div>
      </Card>

      {adjust && (
        <Card className="p-5">
          <div className="mb-3 flex gap-1">
            {(["add", "deduct", "set"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-2.5 py-1 text-[12px] tracking-wide uppercase ${
                  mode === m ? "bg-accent-wash text-accent" : "text-ink-secondary hover:text-ink"
                }`}
              >
                {m === "set" ? "Set balance" : m}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-[11px] tracking-wide text-ink-muted uppercase">
                {mode === "set" ? "New balance" : "Amount"}
              </span>
              <TextField type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] tracking-wide text-ink-muted uppercase">Note (optional)</span>
              <TextField value={note} onChange={(e) => setNote(e.target.value)} placeholder="Booster box, correction…" />
            </label>
            <Button type="submit" variant="primary" disabled={adjust.isPending}>
              {adjust.isPending ? "Saving…" : "Apply"}
            </Button>
          </form>
          {localError && <FormError>{localError}</FormError>}
          {adjust.isError && <FormError>Couldn't apply that. Try again.</FormError>}
        </Card>
      )}

      {ledger.transactions.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No token transactions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Change", "Reason", "Note", "Date"].map((h, i) => (
                  <th
                    key={h}
                    className={`bg-surface-sunken px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase ${
                      i === 0 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.transactions.map((t) => (
                <tr key={t.id}>
                  <td
                    className={`border-t border-border px-4 py-2.5 text-right font-bold tabular-nums ${
                      t.delta >= 0 ? "text-good" : "text-critical"
                    }`}
                  >
                    {t.delta >= 0 ? "+" : ""}
                    {t.delta}
                  </td>
                  <td className="border-t border-border px-4 py-2.5">{reasonLabel(t)}</td>
                  <td className="border-t border-border px-4 py-2.5 text-ink-secondary">{t.note ?? "—"}</td>
                  <td className="border-t border-border px-4 py-2.5 text-ink-muted tabular-nums">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
