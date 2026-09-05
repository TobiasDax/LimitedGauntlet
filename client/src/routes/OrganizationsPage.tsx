import { useState } from "react";
import { ApiError } from "../lib/api";
import { useMe, useSwitchOrg, useSignupStatus, useCreateOrganization } from "../features/auth/useAuth";
import { Button, Card, Field, FormError, TextField } from "../components/ui";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

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
      : createOrg.isError
        ? "Something went wrong."
        : null;

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
                <Button variant="primary" disabled={switchOrg.isPending} onClick={() => switchOrg.mutate(o.id)}>
                  Open
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="border-border border-t pt-5 text-[13px] text-ink-muted">
        Joining an organization someone else runs is by invitation — they send you a link.
        {signupStatus?.allowSignup && !showCreate && (
          <>
            {" "}
            Or{" "}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="text-link underline hover:text-link-strong"
            >
              create another one
            </button>
            .
          </>
        )}
      </div>

      {showCreate && (
        <Card className="mt-4 p-5">
          <div className="mb-3 text-[14px] font-semibold">New organization</div>
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
              <div className="flex items-center gap-1 text-[13px] text-ink-muted">
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
