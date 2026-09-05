import { useNavigate } from "react-router-dom";
import { useMe, useSwitchOrg } from "../features/auth/useAuth";
import { useSignupStatus } from "../features/auth/useAuth";
import { Button, Card } from "../components/ui";

// PI-86 — the org chooser. Shown when a login has no active org: several
// memberships and nothing to resume, or a membership-less account. Also the
// "manage organizations" target from the switcher.
export function OrganizationsPage() {
  const { data: me } = useMe();
  const { data: signupStatus } = useSignupStatus();
  const switchOrg = useSwitchOrg();
  const navigate = useNavigate();

  if (!me) return null;
  const orgs = me.organizations ?? [];

  return (
    <div className="mx-auto max-w-[520px]">
      <h1 className="font-display mb-1 text-[26px] font-bold">Your organizations</h1>
      <p className="mb-6 text-[14px] text-ink-secondary">
        {orgs.length === 0
          ? "You're not a member of any organization yet."
          : "Pick which organization to work in."}
      </p>

      {orgs.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {orgs.map((o) => (
            <Card key={o.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="font-display text-[15px] font-bold">{o.name}</div>
                <div className="text-[12px] text-ink-muted">/o/{o.slug}</div>
              </div>
              {o.id === me.activeOrgId ? (
                <span className="text-[12px] tracking-wide text-accent uppercase">Current</span>
              ) : (
                <Button
                  variant="primary"
                  disabled={switchOrg.isPending}
                  onClick={() =>
                    switchOrg.mutate(o.id, { onSuccess: () => navigate("/") })
                  }
                >
                  Open
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="border-border border-t pt-5 text-[13px] text-ink-muted">
        Joining another organization is by invitation — an organizer there sends you an invite link.
        {signupStatus?.allowSignup && (
          <>
            {" "}
            Or{" "}
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="text-link underline hover:text-link-strong"
            >
              create a new one
            </button>
            .
          </>
        )}
      </div>
    </div>
  );
}
