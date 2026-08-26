import { useRef, useState } from "react";
import {
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useRegenerateWebhookSecret,
  useTestWebhook,
  type OrgWebhook,
} from "../../features/webhooks/useWebhook";
import { Button, Card, Field, FormError, TextField } from "../ui";

// Outbound webhook config (PI-50): any number of HMAC-signed HTTP POSTs
// fired on round lifecycle events (round started/extended/completed,
// pairings posted) so an organizer's own automation(s) — Home Assistant,
// Node-RED, a Discord relay, whatever — can react. Each webhook is
// delivered to independently with its own secret. Per-pod opt-out lives on
// the pod's own edit form.
export function WebhookSection() {
  const { data, isLoading } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  const webhooks = data?.webhooks ?? [];

  return (
    <div>
      <Card className="mb-6 p-5">
        <p className="mb-3 text-[12.5px] text-ink-secondary">
          Each POST carries a JSON body and an <code className="text-[12px]">X-LimitedGauntlet-Signature:
          sha256=…</code> header — an HMAC-SHA256 of the raw body using that webhook's own secret — so your receiving
          automation can verify it really came from this deployment.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            createWebhook.mutate(
              { url: url.trim(), label: label.trim() || undefined },
              { onSuccess: () => { setUrl(""); setLabel(""); } },
            );
          }}
        >
          <div className="flex-1">
            <Field label="Webhook URL">
              <TextField
                type="url"
                placeholder="https://your-home-assistant/api/webhook/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Label (optional)">
              <TextField placeholder="Home Assistant" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={!url.trim() || createWebhook.isPending}>
            {createWebhook.isPending ? "Adding…" : "+ Add webhook"}
          </Button>
        </form>
        {createWebhook.isError && (
          <FormError>Couldn't save that URL — check it's a valid http(s) address.</FormError>
        )}
      </Card>

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : webhooks.length === 0 ? (
        <p className="text-ink-muted">No webhooks configured.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {webhooks.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} />
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookRow({ webhook }: { webhook: OrgWebhook }) {
  const deleteWebhook = useDeleteWebhook();
  const regenerateSecret = useRegenerateWebhookSecret();
  const testWebhook = useTestWebhook();
  const [copied, setCopied] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(webhook.secret);
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

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {webhook.label && <div className="font-display text-[15px] font-bold">{webhook.label}</div>}
          <div className="truncate text-[13px] text-ink-secondary" title={webhook.url}>
            {webhook.url}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={deleteWebhook.isPending}
          onClick={() => {
            if (confirm("Delete this webhook? Any automation using it will stop receiving events.")) {
              deleteWebhook.mutate(webhook.id);
            }
          }}
        >
          Delete
        </Button>
      </div>

      <div className="mb-3">
        <Field label="Signing secret">
          <div className="flex gap-2">
            <input
              ref={secretRef}
              readOnly
              value={webhook.secret}
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
        <Button type="button" variant="ghost" disabled={testWebhook.isPending} onClick={() => testWebhook.mutate(webhook.id)}>
          {testWebhook.isPending ? "Sending…" : "Send test event"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={regenerateSecret.isPending}
          onClick={() => {
            if (confirm("Regenerate this webhook's signing secret? Any automation using the old secret will stop verifying.")) {
              regenerateSecret.mutate(webhook.id);
            }
          }}
        >
          {regenerateSecret.isPending ? "Regenerating…" : "Regenerate secret"}
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
    </Card>
  );
}
