import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button, Modal } from "./ui";

// Share popup (PI-45): shows a public link with a copy button and a scannable
// QR code (generated client-side — no server round-trip, works offline once the
// page is loaded). Reusable across public surfaces; the pod link is the primary
// caller. `path` is an app-relative path; the absolute URL is built from the
// current origin so it's whatever host the organizer is actually reaching.
export function SharePopup({ path, title, onClose }: { path: string; title: string; onClose: () => void }) {
  const url = `${window.location.origin}${path}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API needs a secure context (HTTPS) — on a plain-HTTP LAN
      // deployment it's unavailable, so fall back to selecting + execCommand.
      const el = inputRef.current;
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
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-lg bg-white p-3">
          <QRCodeSVG value={url} size={196} marginSize={0} />
        </div>
        <p className="text-center text-[12.5px] text-ink-muted">Scan to open the public page on a phone.</p>
        <div className="flex w-full gap-2">
          <input
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />
          <Button variant="primary" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
