import { useNavigate } from "react-router-dom";
import { useMe } from "../../features/auth/useAuth";
import { Button } from "../ui";

// A bought-but-unspent tournament pass is money the organizer has paid and not
// yet used, so it gets a prominent call to action at the top of Settings
// instead of a line buried in the plan card. Hosted-only: unusedPasses is 0 on
// self-hosted, so this never renders there.
export function UnusedPassBanner() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const unused = me?.entitlement?.unusedPasses ?? 0;
  if (!me?.entitlement?.enforced || unused === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent bg-accent/14 px-5 py-4">
      <div>
        <div className="font-display text-base font-bold text-ink">
          You have {unused} unused tournament {unused === 1 ? "pass" : "passes"}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          Create a tournament to put {unused === 1 ? "it" : "one"} to use — a pass-covered tournament can run unlimited
          pods.
        </p>
      </div>
      <Button variant="primary" onClick={() => navigate("/?new=paid")}>
        Create paid tournament
      </Button>
    </div>
  );
}
