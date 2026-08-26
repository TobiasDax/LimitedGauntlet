import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOidcPending, useCompleteOidcRegistration } from "../features/auth/useAuth";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { ApiError } from "../lib/api";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Org-setup screen after a first SSO login with no existing account (PI-42).
// The verified email/subject live in the session; here the new organizer only
// names their org and themselves. No account exists yet if there's nothing
// pending, so we bounce back to /login.
export function OidcSetupPage() {
  const { data: pending, isLoading } = useOidcPending();
  const complete = useCompleteOidcRegistration();
  const navigate = useNavigate();

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [organizerName, setOrganizerName] = useState("");

  // Prefill the display name from the IdP once it loads.
  useEffect(() => {
    if (pending?.suggestedName) setOrganizerName((prev) => prev || pending.suggestedName);
  }, [pending?.suggestedName]);

  useEffect(() => {
    if (!isLoading && !pending) navigate("/login", { replace: true });
  }, [isLoading, pending, navigate]);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!pending) return null; // redirecting

  return (
    <div className="mx-auto max-w-[420px] py-16">
      <h1 className="font-display mb-1 text-[26px] font-bold">Finish setting up</h1>
      <p className="mb-8 text-[14px] text-ink-secondary">
        Signed in as <span className="text-ink">{pending.email}</span>. Name your organization to get started — this is
        the last step.
      </p>

      <Card className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            complete.mutate({ orgName, orgSlug, organizerName }, { onSuccess: () => navigate("/") });
          }}
        >
          <Field label="Organization name" hint="e.g. your playgroup's name">
            <TextField
              required
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!slugTouched) setOrgSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="URL slug" hint="Used in shareable links — lowercase, numbers, hyphens">
            <TextField
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              value={orgSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setOrgSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Your name">
            <TextField required value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
          </Field>

          {complete.isError && (
            <FormError>
              {complete.error instanceof ApiError && complete.error.status === 409
                ? complete.error.message === "slug_taken"
                  ? "That URL slug is already taken — try a different one."
                  : "An account for your identity already exists — try logging in again."
                : complete.error instanceof ApiError && complete.error.message === "no_pending_registration"
                  ? "Your SSO session expired. Please sign in again."
                  : "Something went wrong. Try again."}
            </FormError>
          )}

          <Button type="submit" variant="primary" disabled={complete.isPending}>
            {complete.isPending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
