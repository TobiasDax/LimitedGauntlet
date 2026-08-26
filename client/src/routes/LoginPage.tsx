import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLogin } from "../features/auth/useAuth";
import { useAppConfig } from "../features/config/useAppConfig";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { ApiError } from "../lib/api";

// The OIDC callback redirects back here with ?error=<code> when SSO login can't
// resolve to an account (PI-42) — translate the code to a human message.
const oidcErrorMessages: Record<string, string> = {
  oidc_no_account: "No organizer account matches your SSO identity. Ask an organizer to invite your email first.",
  oidc_email_unverified: "Your identity provider didn't share a verified email, so we can't match your account.",
  oidc_expired: "That SSO login expired before it finished. Please try again.",
  oidc_failed: "SSO login failed. Please try again.",
  oidc_unavailable: "SSO is temporarily unavailable. Try again, or log in with your password.",
};

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();
  const { data: appConfig } = useAppConfig();
  const [searchParams] = useSearchParams();
  const oidcError = searchParams.get("error");
  const oidcErrorText = oidcError ? (oidcErrorMessages[oidcError] ?? "SSO login failed. Please try again.") : null;

  return (
    <div className="mx-auto max-w-[380px] py-16">
      <h1 className="font-display mb-1 text-[26px] font-bold">Log in</h1>
      <p className="mb-8 text-[14px] text-ink-secondary">Back to running the tournament.</p>

      {oidcErrorText && (
        <div className="mb-4">
          <FormError>{oidcErrorText}</FormError>
        </div>
      )}

      {appConfig?.oidcEnabled && (
        <div className="mb-5">
          {/* Full-page navigation, not fetch — this kicks off a redirect flow. */}
          <a href="/api/auth/oidc/login" className="block">
            <Button type="button" variant="primary" className="w-full">
              Sign in with {appConfig.oidcProviderName || "SSO"}
            </Button>
          </a>
          <div className="my-5 flex items-center gap-3 text-[11.5px] tracking-wide text-ink-muted uppercase">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}

      <Card className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate({ email, password }, { onSuccess: () => navigate("/") });
          }}
        >
          <Field label="Email">
            <TextField
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextField
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {login.isError && (
            <FormError>
              {login.error instanceof ApiError && login.error.status === 401
                ? "Wrong email or password."
                : "Something went wrong. Try again."}
            </FormError>
          )}

          <Button type="submit" variant="primary" disabled={login.isPending}>
            {login.isPending ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </Card>

      <p className="mt-5 text-center text-[13px] text-ink-secondary">
        New group?{" "}
        <Link to="/signup" className="text-accent hover:text-accent-strong">
          Create an organization
        </Link>
      </p>
    </div>
  );
}
