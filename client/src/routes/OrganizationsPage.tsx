import { useState } from "react";
import { ApiError } from "../lib/api";
import { entitlementRefusal } from "../features/billing/upsell";
import { useMe, useSwitchOrg, useSignupStatus, useCreateOrganization } from "../features/auth/useAuth";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { useAppConfig } from "../features/config/useAppConfig";

// HI-9 — what a logged-in account with no organization yet is shown.
//
// The same page serves both kinds of deployment, and the difference is not
// cosmetic: a self-hosted install is running the complete app, so it shows
// what an organization gives you and nothing else. Tiers, quotas and anything
// purchasable render only when the deployment actually runs hosted
// entitlements. Keep every hosted-only element inside the `hosted` branch —
// a self-hoster should never see a plan, a limit, or a price.
function GettingStarted({ onCreate }: { onCreate: () => void }) {
  const { data: appConfig } = useAppConfig();
  const hosted = appConfig?.hostedEntitlements === true;

  return (
    <Card className="mb-6 p-5">
      <div className="font-display mb-1 text-base font-bold">Create your organization</div>
      <p className="mb-4 text-sm text-ink-muted">
        An organization holds your player roster and every tournament you run. Creating one is the first step —
        tournaments, pods, pairings and standings all live inside it.
      </p>

      {hosted ? (
        <div className="mb-4 flex flex-col gap-3">
          <div className="border-border rounded-md border p-4">
            <div className="text-md font-semibold">Free organization</div>
            <p className="mt-1 text-sm text-ink-muted">
              One tournament with one pod, for a single event of up to a week. You add the tournament after creating the
              organization; its dates are fixed once you set them, and everything stays readable for a month after it
              ends.
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              Each account gets one free organization — the free tournament isn't used up until you create it.
            </p>
          </div>
          <div className="border-border rounded-md border border-dashed p-4">
            <div className="text-md font-semibold">Need more than one event?</div>
            <p className="mt-1 text-sm text-ink-muted">
              A single tournament can be unlocked for unlimited pods, or a subscription removes the limits entirely —
              unlimited tournaments, editable dates, co-organizers, webhooks, exports and API access. You can start free
              and upgrade later; upgrading your free tournament hands the free slot back.
            </p>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-ink-muted">
          This is a self-hosted install, so your organization has everything: unlimited tournaments and pods,
          co-organizers, webhooks, exports and API access, with no limits and nothing to pay for.
        </p>
      )}

      <Button variant="primary" onClick={onCreate}>
        Create organization
      </Button>
    </Card>
  );
}

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// PI-86 — the org chooser. Shown when a login has no active org (several
// memberships, nothing to resume, or a membership-less account) and as the
// "manage organizations" target from the switcher. An existing organizer can
// also spin up another org here — that adds a membership, not a new account.
export function OrganizationsPage() {
  const { data: me } = useMe();
  const { data: signupStatus } = useSignupStatus();
  const switchOrg = useSwitchOrg();
  const createOrg = useCreateOrganization();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  if (!me) return null;
  const orgs = me.organizations ?? [];

  const createError =
    createOrg.error instanceof ApiError && createOrg.error.message === "slug_taken"
      ? "That URL is already taken — pick another."
      : entitlementRefusal(createOrg.error)?.reason === "free_org_limit"
        ? "Your free organization is already in use. To create another one, upgrade your existing organization to a tournament pass or a Series subscription first (Settings → Plan & billing)."
        : createOrg.isError
          ? "Something went wrong."
          : null;

  return (
    <div className="mx-auto max-w-[520px]">
      <h1 className="font-display mb-1 text-2xl font-bold">Your organizations</h1>
      <p className="mb-6 text-md text-ink-muted">
        {orgs.length === 0 ? "You're not a member of any organization yet." : "Pick which organization to work in."}
      </p>

      {orgs.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {orgs.map((o) => (
            <Card key={o.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="font-display text-base font-bold">{o.name}</div>
                <div className="text-xs text-ink-muted">/o/{o.slug}</div>
              </div>
              {o.id === me.activeOrgId ? (
                <span className="text-xs tracking-wide text-accent uppercase">Current</span>
              ) : (
                <Button variant="primary" disabled={switchOrg.isPending} onClick={() => switchOrg.mutate(o.id)}>
                  Open
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {orgs.length === 0 && !showCreate && <GettingStarted onCreate={() => setShowCreate(true)} />}

      <div className="border-border border-t pt-5 text-sm text-ink-muted">
        Joining an organization someone else runs is by invitation — they send you a link.
        {signupStatus?.allowSignup && !showCreate && (
          <>
            {" "}
            Or{" "}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="text-link underline hover:text-link-hover"
            >
              create another one
            </button>
            .
          </>
        )}
      </div>

      {showCreate && (
        <Card className="mt-4 p-5">
          <div className="mb-3 text-md font-semibold">New organization</div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const finalSlug = slug || slugify(name);
              if (!slugPattern.test(finalSlug)) return;
              createOrg.mutate({ orgName: name.trim(), orgSlug: finalSlug });
            }}
          >
            <Field label="Name">
              <TextField
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="URL" hint="lowercase letters, numbers, hyphens">
              <div className="flex items-center gap-1 text-sm text-ink-muted">
                /o/
                <TextField
                  required
                  minLength={3}
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value);
                  }}
                />
              </div>
            </Field>

            {createError && <FormError>{createError}</FormError>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!name || createOrg.isPending}>
                {createOrg.isPending ? "Creating…" : "Create"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
