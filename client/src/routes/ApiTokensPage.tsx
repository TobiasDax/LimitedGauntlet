import { useState } from "react";
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from "../features/apiTokens/useApiTokens";
import { Button, Card, Eyebrow, FormError, ScreenDek, ScreenTitle, TextField } from "../components/ui";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ApiTokensPage() {
  const { data, isLoading } = useApiTokens();
  const createToken = useCreateApiToken();
  const revokeToken = useRevokeApiToken();
  const [name, setName] = useState("");
  const [justMinted, setJustMinted] = useState<string | null>(null);

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>API Tokens</ScreenTitle>
      <ScreenDek>
        Bearer tokens for non-browser clients (e.g. the MCP server) — a token acts as you, with the same access your
        login has. Keep it as secret as your password; anyone in this browser session can mint or revoke tokens, but
        the token itself only ever works over the API, never to log into the app directly.
      </ScreenDek>

      {justMinted && (
        <Card className="mb-6 border-accent/40 p-5">
          <div className="mb-2 text-[12px] font-semibold tracking-wide text-accent uppercase">
            Copy this now — it won't be shown again
          </div>
          <code className="block overflow-x-auto rounded bg-surface-sunken px-3 py-2 text-[13px] break-all">
            {justMinted}
          </code>
          <Button variant="ghost" className="mt-2" onClick={() => setJustMinted(null)}>
            Done
          </Button>
        </Card>
      )}

      <Card className="mb-6 p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createToken.mutate(name.trim(), {
              onSuccess: (res) => {
                setJustMinted(res.token);
                setName("");
              },
            });
          }}
        >
          <TextField
            className="flex-1"
            placeholder="Token name (e.g. MCP on dev laptop)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!name.trim() || createToken.isPending}>
            {createToken.isPending ? "Creating…" : "+ New token"}
          </Button>
        </form>
        {createToken.isError && <FormError>Something went wrong.</FormError>}
      </Card>

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : !data || data.apiTokens.length === 0 ? (
        <p className="text-ink-muted">No tokens yet.</p>
      ) : (
        <Card className="divide-y divide-border">
          {data.apiTokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-display text-[15px] font-bold">{t.name}</div>
                <div className="text-[12px] text-ink-muted">
                  Created {formatDate(t.createdAt)}
                  {t.lastUsedAt ? ` · last used ${formatDate(t.lastUsedAt)}` : " · never used"}
                </div>
              </div>
              <Button variant="ghost" onClick={() => revokeToken.mutate(t.id)} disabled={revokeToken.isPending}>
                Revoke
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
