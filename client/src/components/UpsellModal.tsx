import { useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Button } from "./ui";
import { subscribeUpsell, getUpsell, dismissUpsell, upsellCopy } from "../features/billing/upsell";

// HI-9 — the single surface for every entitlement refusal (402). Mounted once
// at the app root; raised by the QueryClient's global mutation-error handler
// (see main.tsx), never by individual mutations. Only ever appears on a hosted
// instance, since enforcement is what produces a 402 in the first place.
export function UpsellModal() {
  const current = useSyncExternalStore(subscribeUpsell, getUpsell, getUpsell);
  const navigate = useNavigate();

  if (!current) return null;
  const { title, body } = upsellCopy(current);

  return (
    <Modal title={title} onClose={dismissUpsell}>
      <p className="text-[14px] text-ink-secondary">{body}</p>
      <div className="mt-5 flex gap-2">
        <Button
          variant="primary"
          onClick={() => {
            dismissUpsell();
            void navigate("/settings");
          }}
        >
          See plans
        </Button>
        <Button variant="ghost" onClick={dismissUpsell}>
          Not now
        </Button>
      </div>
    </Modal>
  );
}
