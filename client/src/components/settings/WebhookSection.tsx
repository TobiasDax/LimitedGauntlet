import { useRef, useState } from "react";
import {
  useWebhookConfig,
  useSetWebhookUrl,
  useRegenerateWebhookSecret,
  useTestWebhook,
} from "../../features/webhooks/useWebhook";
import { Button, Card, Field, FormError, TextField } from "../ui";

// Outbound webhook config (PI-50): an HMAC-signed HTTP POST fired on round
// lifecycle events (round started/extended/completed, pairings posted) so an
// organizer's own automation (Home Assistant, etc.) can react. Off unless a
// URL is set. Per-pod opt-out lives on the pod's own edit form.
export function WebhookSection() {
  const { data, isLoading } = useWebhookConfig();
  const setUrl = useSetWebhookUrl();
  const regenerateSecret = useRegenerateWebhookSecret();
  const testWebhook = useTestWebhook();
  const [url, setUrlInput] = useState("");
  const [copied, setCopied] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);

  const configured = !!data?.url;

  async function copySecret() {
    if (!data?.secret) return;
    try {
      await navigator.clipboard.writeText(data.secret);
    } catch {
      const el = secretRef.current;
      if (el) {
        el.focus();
        el.select();
        try {
          document.execCommand("copy");
        } catch {
          /* nothing more we can do — the text is at least selected for a manual copy */
        }
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${configured ? "bg-good" : "bg-ink-muted"}`}
          aria-hidden="true"
        />
        <span className="text-[14px] font-semibold">
          {configured ? "Webhook configured" : "No webhook configured"}
        </span>
      </div>

      <p className="mb-3 text-[12.5px] text-ink-secondary">
        Fires an HTTP POST to this URL when a round starts, is extended, or completes, and when a round's pairings
        are posted. Each request carries a JSON body and an <code className="text-[12px]">X-LimitedGauntlet-Signature:
        sha256=…</code> header — an HMAC-SHA256 of the raw body using the secret below — so your receiving automation
        can verify it really came from this deployment.
      </p>

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          setUrl.mutate(url.trim(), { onSuccess: () => setUrlInput("") });
        }}
      >
        <div className="flex-1">
          <Field label={configured ? "Change URL" : "Webhook URL"}>
            <TextField
              type="url"
              placeholder="https://your-home-assistant/api/webhook/…"
              value={url}
              onChange={(e) => setUrlInput(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={!url.trim() || setUrl.isPending}>
          {setUrl.isPending ? "Saving…" : configured ? "Update URL" : "Enable webhook"}
        </Button>
      </form>
      {setUrl.isError && <FormError>Couldn't save that URL — check it's a valid http(s) address.</FormError>}

      {configured && data && (
        <>
          <div className="mb-3">
            <Field label="Signing secret">
              <div className="flex gap-2">
                <input
                  ref={secretRef}
                  readOnly
                  value={data.secret ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                />
                <Button type="button" variant="ghost" onClick={copySecret}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={testWebhook.isPending}
              onClick={() => testWebhook.mutate()}
            >
              {testWebhook.isPending ? "Sending…" : "Send test event"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={regenerateSecret.isPending}
              onClick={() => {
                if (confirm("Regenerate the signing secret? Any automation using the old secret will stop verifying.")) {
                  regenerateSecret.mutate();
                }
              }}
            >
              {regenerateSecret.isPending ? "Regenerating…" : "Regenerate secret"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={setUrl.isPending}
              onClick={() => {
                if (confirm("Disable the webhook? This clears the URL and secret.")) {
                  setUrl.mutate(null);
                }
              }}
            >
              Disable webhook
            </Button>
          </div>

          {testWebhook.isSuccess && (
            <p className={`mt-2 text-[12.5px] ${testWebhook.data.ok ? "text-good" : "text-critical"}`}>
              {testWebhook.data.ok
                ? `Test event delivered (HTTP ${testWebhook.data.status}).`
                : testWebhook.data.error === "unsafe_target"
                  ? "That URL resolves to a loopback or link-local address, which isn't allowed as a webhook target."
                  : `Delivery failed${testWebhook.data.status ? ` (HTTP ${testWebhook.data.status})` : ""}${testWebhook.data.error ? `: ${testWebhook.data.error}` : "."}`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
