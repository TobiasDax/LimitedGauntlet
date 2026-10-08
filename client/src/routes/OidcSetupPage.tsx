import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOidcPending, useCompleteOidcRegistration } from "../features/auth/useAuth";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { ApiError } from "../lib/api";

// Account-setup screen after a first SSO login with no existing account
// (PI-42). HI-6 — this now finishes the *account* only (just the display
// name); the org is created afterward on the chooser, so registering doesn't
// commit an org/free tournament. Bounces to /login if nothing's pending.
export function OidcSetupPage() {
  const { data: pending, isLoading } = useOidcPending();
  const complete = useCompleteOidcRegistration();
  const navigate = useNavigate();

  const [organizerName, setOrganizerName] = useState("");

  // Prefill the display name from the IdP once it loads.
  useEffect(() => {
    if (pending?.suggestedName) setOrganizerName((prev) => prev || pending.suggestedName);
  }, [pending?.suggestedName]);

  useEffect(() => {
    if (!isLoading && !pending) void navigate("/login", { replace: true });
  }, [isLoading, pending, navigate]);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!pending) return null; // redirecting

  return (
    <div className="mx-auto max-w-[420px] py-16">
      <h1 className="font-display mb-1 text-[26px] font-bold">Finish setting up</h1>
      <p className="mb-8 text-[14px] text-ink-muted">
        Signed in as <span className="text-ink">{pending.email}</span>. Confirm your name — you'll set up your
        organization next.
      </p>

      <Card className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // Org-less on success → the chooser prompts to create the org.
            complete.mutate({ organizerName }, { onSuccess: () => navigate("/") });
          }}
        >
          <Field label="Your name">
            <TextField required value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
          </Field>

          {complete.isError && (
            <FormError>
              {complete.error instanceof ApiError && complete.error.status === 409
                ? "An account for your identity already exists — try logging in again."
                : complete.error instanceof ApiError && complete.error.message === "no_pending_registration"
                  ? "Your SSO session expired. Please sign in again."
                  : "Something went wrong. Try again."}
            </FormError>
          )}

          <Button type="submit" variant="primary" disabled={complete.isPending}>
            {complete.isPending ? "Saving…" : "Continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
