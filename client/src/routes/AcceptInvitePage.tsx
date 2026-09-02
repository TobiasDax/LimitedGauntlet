import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useInviteInfo, useAcceptInvite } from "../features/auth/useAuth";
import { useAppConfig } from "../features/config/useAppConfig";
import { Button, Card, Eyebrow, Field, FormError, ScreenTitle, TextField } from "../components/ui";
import { SsoButtons } from "../components/SsoButtons";

// Landing page for a co-organizer invite link (PI-34). Public — the token is
// the proof, so this works for someone with no account yet. Mirrors
// VerifyEmailPage's token-status handling plus SignupPage's form shape,
// since accepting also means setting a name + password for a new account.
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { data: invite, isLoading, isError: inviteInvalid } = useInviteInfo(token);
  const acceptInvite = useAcceptInvite();
  const { data: appConfig } = useAppConfig();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="mx-auto max-w-md pt-16">
        <Eyebrow>Invite</Eyebrow>
        <ScreenTitle>Accept invite</ScreenTitle>
        <Card className="mt-4 p-6">
          <p className="mb-4 text-critical">This link is missing its token.</p>
          <Link to="/">
            <Button variant="ghost">Back to app</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-16">
      <Eyebrow>Invite</Eyebrow>
      <ScreenTitle>Accept invite</ScreenTitle>
      <Card className="mt-4 p-6">
        {isLoading && <p className="text-ink-secondary">Checking invite…</p>}

        {inviteInvalid && (
          <>
            <p className="mb-4 text-critical">
              This invite is invalid or has expired. Ask whoever invited you to send a new one.
            </p>
            <Link to="/login">
              <Button variant="ghost">Back to login</Button>
            </Link>
          </>
        )}

        {invite && appConfig?.localLoginDisabled ? (
          <>
            <p className="mb-4 text-[14px] text-ink-secondary">
              You've been invited to co-organize <strong>{invite.organizationName}</strong>.
              Sign in with the SSO account for <strong>{invite.email}</strong> to accept.
            </p>
            <SsoButtons providers={appConfig.ssoProviders ?? []} />
          </>
        ) : invite && (
          <>
            <p className="mb-4 text-[14px] text-ink-secondary">
              You've been invited to co-organize <strong>{invite.organizationName}</strong> as {invite.email}.
            </p>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setLocalError(null);
                if (password.length < 8) {
                  setLocalError("Password must be at least 8 characters.");
                  return;
                }
                if (password !== confirmPassword) {
                  setLocalError("Passwords don't match.");
                  return;
                }
                acceptInvite.mutate(
                  { token, name, password },
                  { onSuccess: () => navigate("/") },
                );
              }}
            >
              <Field label="Your name">
                <TextField required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <TextField
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirm password">
                <TextField
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>

              {localError && <FormError>{localError}</FormError>}
              {acceptInvite.isError && (
                <FormError>
                  {acceptInvite.error instanceof ApiError && acceptInvite.error.message === "email_taken"
                    ? "That email now has an account — log in instead."
                    : acceptInvite.error instanceof ApiError && acceptInvite.error.message === "invalid_or_expired"
                      ? "This invite is invalid or has expired."
                      : "Something went wrong."}
                </FormError>
              )}

              <Button type="submit" variant="primary" disabled={!name || !password || acceptInvite.isPending}>
                {acceptInvite.isPending ? "Joining…" : "Accept invite"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
