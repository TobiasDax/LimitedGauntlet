import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSignup, useSignupStatus } from "../features/auth/useAuth";
import { useAppConfig } from "../features/config/useAppConfig";
import { SsoButtons } from "../components/SsoButtons";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { ApiError } from "../lib/api";

export function SignupPage() {
  const [organizerName, setOrganizerName] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [organizerPassword, setOrganizerPassword] = useState("");
  const signup = useSignup();
  const navigate = useNavigate();
  const { data: signupStatus, isLoading: statusLoading } = useSignupStatus();
  const { data: appConfig } = useAppConfig();

  return (
    <div className="mx-auto max-w-[420px] py-16">
      <h1 className="font-display mb-1 text-2xl font-bold">Create your account</h1>
      <p className="mb-8 text-md text-ink-muted">
        {/* HI-6 — registration is account-only now; the org is the next step. */}
        Register first — you'll set up your organization right after, so nothing's committed until you do.
      </p>

      {appConfig?.localLoginDisabled ? (
        // SSO-only mode: no local accounts. Registration happens by signing in
        // with SSO, which drops the first-time user into the org-setup screen.
        <Card className="p-6 text-center">
          <p className="mb-4 text-md text-ink-muted">
            This instance uses single sign-on — if you don't have an organization yet, you'll be prompted to create one
            after signing in.
          </p>
          <SsoButtons providers={appConfig.ssoProviders ?? []} />
        </Card>
      ) : statusLoading ? null : !signupStatus?.allowSignup ? (
        <Card className="p-6 text-center">
          <p className="text-md text-ink-muted">
            Signups are closed right now. Ask whoever's running this instance for an invite, or to open signups briefly.
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              signup.mutate(
                { organizerName, organizerEmail, organizerPassword },
                // Org-less on success → ProtectedRoute sends them to the org
                // chooser to create their organization as the next step.
                { onSuccess: () => navigate("/") },
              );
            }}
          >
            <Field label="Your name">
              <TextField required value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
            </Field>
            <Field label="Email">
              <TextField
                type="email"
                autoComplete="email"
                required
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" hint="At least 8 characters">
              <TextField
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={organizerPassword}
                onChange={(e) => setOrganizerPassword(e.target.value)}
              />
            </Field>

            {signup.isError && (
              <FormError>
                {signup.error instanceof ApiError && signup.error.status === 409
                  ? "That email already has an account — log in instead."
                  : signup.error instanceof ApiError && signup.error.status === 403
                    ? "Signups just closed — ask whoever's running this instance."
                    : "Something went wrong. Try again."}
              </FormError>
            )}

            <Button type="submit" variant="primary" disabled={signup.isPending}>
              {signup.isPending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </Card>
      )}

      <p className="mt-5 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:text-accent-hover">
          Log in
        </Link>
      </p>

      {appConfig?.legalPageEnabled !== false && (
        <p className="mt-3 text-center text-xs text-ink-muted">
          By creating an account you acknowledge the{" "}
          <Link to="/legal" className="underline hover:text-ink-muted">
            legal notice
          </Link>
          . As an organizer you are the data controller for the people you add.
        </p>
      )}
    </div>
  );
}
