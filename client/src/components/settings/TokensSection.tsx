import { useMe, useToggleTokens } from "../../features/auth/useAuth";
import { Button, Card } from "../ui";

// PI-72 — opt in / out of the tokens feature. Off by default; while off nothing
// token-related appears anywhere and no tokens are awarded (existing ledger
// rows are kept, so re-enabling restores them).
export function TokensSection() {
  const { data: me } = useMe();
  const toggle = useToggleTokens();
  const enabled = me?.tokensEnabled ?? false;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${enabled ? "bg-good" : "bg-ink-muted"}`}
          aria-hidden="true"
        />
        <span className="text-[14px] font-semibold">
          {enabled ? "Tokens are on" : "Tokens are off"}
        </span>
      </div>
      <p className="mb-4 max-w-lg text-[13px] text-ink-secondary">
        Players earn <strong>tokens</strong> for playing in pods and for their finishing place — a running,
        org-wide balance you can hand-adjust and players can spend on your prize wall (which lives outside
        this app). Set the default reward values in each tournament's settings, overridable per pod.
        {enabled ? "" : " Turning this on backfills tokens for every completed pod using the current reward config."}
      </p>
      <Button
        variant={enabled ? "ghost" : "primary"}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!enabled)}
      >
        {toggle.isPending ? "Saving…" : enabled ? "Turn tokens off" : "Turn tokens on"}
      </Button>
    </Card>
  );
}
