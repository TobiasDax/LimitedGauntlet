import { useState } from "react";
import { ApiError } from "../../lib/api";
import { useMe, useChangePassword, useRequestEmailChange } from "../../features/auth/useAuth";
import { Button, Card, FormError, TextField } from "../ui";

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "request_failed";
}

// PI-42 follow-up — an SSO-only account (hasPassword false) has no current
// password to enter, so "Change password" becomes "Set password" (no current
// field) and email change drops the current-password field too.

function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-3 text-[14px] font-semibold">{hasPassword ? "Change password" : "Set password"}</div>
      {!hasPassword && (
        <p className="mb-3 text-[13px] text-ink-muted">
          You sign in with SSO and have no password set. Adding one is optional — it lets you also sign in with email
          and password.
        </p>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setLocalError(null);
          setDone(false);
          if (next.length < 8) {
            setLocalError("New password must be at least 8 characters.");
            return;
          }
          if (next !== confirm) {
            setLocalError("New passwords don't match.");
            return;
          }
          changePassword.mutate(
            { currentPassword: hasPassword ? current : undefined, newPassword: next },
            {
              onSuccess: () => {
                setDone(true);
                setCurrent("");
                setNext("");
                setConfirm("");
              },
            },
          );
        }}
      >
        {hasPassword && (
          <TextField type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
        <TextField type="password" autoComplete="new-password" placeholder="New password (min 8)" value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div>
          <Button type="submit" variant="primary" disabled={(hasPassword && !current) || !next || changePassword.isPending}>
            {changePassword.isPending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
          </Button>
        </div>
      </form>
      {localError && <FormError>{localError}</FormError>}
      {changePassword.isError && (
        <FormError>{codeOf(changePassword.error) === "invalid_password" ? "Current password is incorrect." : "Something went wrong."}</FormError>
      )}
      {done && <p className="mt-2 text-[13px] text-good">{hasPassword ? "Password changed." : "Password set."}</p>}
    </Card>
  );
}

function ChangeEmailForm({ currentEmail, hasPassword }: { currentEmail: string; hasPassword: boolean }) {
  const requestChange = useRequestEmailChange();
  const [current, setCurrent] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [sent, setSent] = useState(false);

  const errorCode = requestChange.isError ? codeOf(requestChange.error) : null;
  const errorText =
    errorCode === "invalid_password"
      ? "Current password is incorrect."
      : errorCode === "email_taken"
        ? "That email is already in use."
        : errorCode === "same_email"
          ? "That's already your email."
          : errorCode === "email_not_configured"
            ? "Email isn't configured on this server, so email changes aren't available."
            : errorCode
              ? "Something went wrong."
              : null;

  return (
    <Card className="p-5">
      <div className="mb-1 text-[14px] font-semibold">Change email</div>
      <p className="mb-3 text-[13px] text-ink-muted">
        Current: {currentEmail}. We'll send a confirmation link to the new address; the change takes effect once you
        click it.
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(false);
          requestChange.mutate(
            { currentPassword: hasPassword ? current : undefined, newEmail },
            {
              onSuccess: () => {
                setSent(true);
                setCurrent("");
                setNewEmail("");
              },
            },
          );
        }}
      >
        {hasPassword && (
          <TextField type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
        <TextField type="email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <div>
          <Button type="submit" variant="primary" disabled={(hasPassword && !current) || !newEmail || requestChange.isPending}>
            {requestChange.isPending ? "Sending…" : "Send confirmation link"}
          </Button>
        </div>
      </form>
      {errorText && <FormError>{errorText}</FormError>}
      {sent && <p className="mt-2 text-[13px] text-good">Check your new inbox for a confirmation link (expires in 1 hour).</p>}
    </Card>
  );
}

// PI-87 — /profile: identity only, org-independent. Reads me.identity (always
// present for a logged-in session), falling back to me.organizer for a cache
// that predates /auth/me.
export function ProfileSection() {
  const { data: me } = useMe();
  if (!me) return null;
  const email = me.identity?.email ?? me.organizer?.email;
  if (!email) return null;
  const hasPassword = me.identity?.hasPassword ?? me.hasPassword ?? true;
  return (
    <div className="flex flex-col gap-4">
      <ChangeEmailForm currentEmail={email} hasPassword={hasPassword} />
      <ChangePasswordForm hasPassword={hasPassword} />
    </div>
  );
}
