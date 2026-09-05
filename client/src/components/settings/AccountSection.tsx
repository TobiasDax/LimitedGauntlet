import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import {
  useMe,
  useChangePassword,
  useRequestEmailChange,
  useDeleteAccount,
} from "../../features/auth/useAuth";
import { useDeleteOrganization } from "../../features/organizers/useOrganizers";
import { Button, Card, FormError, TextField } from "../ui";

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "request_failed";
}

// PI-42 follow-up — an SSO-only account (hasPassword false) has no current
// password to enter. "Change password" becomes "Set password" (no current
// field), and the destructive forms drop the password field entirely,
// re-confirming via the typed name alone (see settings.ts).

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
      <p className="mb-3 text-[13px] text-ink-muted">Current: {currentEmail}. We'll send a confirmation link to the new address; the change takes effect once you click it.</p>
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

// PI-34: when co-organizers exist, "delete account" only removes THIS
// organizer's own access — the org and everyone else's data are untouched.
// Solo organizers keep the original behavior (deletes the whole org).
function DeleteAccountForm({
  orgName,
  email,
  organizerCount,
  hasPassword,
}: {
  orgName: string;
  email: string;
  organizerCount: number;
  hasPassword: boolean;
}) {
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const leaving = organizerCount > 1;
  const expected = leaving ? email : orgName;
  const canSubmit = (!hasPassword || !!password) && confirmName.trim() === expected && !deleteAccount.isPending;

  return (
    <Card className="border-critical/40 p-5">
      <div className="mb-1 text-[14px] font-semibold text-critical">{leaving ? "Leave organization" : "Delete account"}</div>
      <p className="mb-3 text-[13px] text-ink-muted">
        {leaving ? (
          <>
            This removes your access to <strong>{orgName}</strong>. The other {organizerCount - 1 === 1 ? "organizer keeps" : "organizers keep"} theirs
            and nothing else changes.
          </>
        ) : (
          <>
            This permanently deletes your organization <strong>{orgName}</strong> and everything in it — every tournament,
            pod, result, and card pull. This cannot be undone.
          </>
        )}
      </p>
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {leaving ? "Leave organization…" : "Delete account…"}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmName.trim() !== expected) return;
            deleteAccount.mutate(
              { currentPassword: hasPassword ? password : undefined, confirmName },
              { onSuccess: () => navigate("/login") },
            );
          }}
        >
          {hasPassword && (
            <TextField type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          <TextField placeholder={`Type "${expected}" to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {deleteAccount.isPending ? (leaving ? "Leaving…" : "Deleting…") : leaving ? "Leave organization" : "Permanently delete"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {deleteAccount.isError && (
        <FormError>{codeOf(deleteAccount.error) === "invalid_password" ? "Current password is incorrect." : "Something went wrong."}</FormError>
      )}
    </Card>
  );
}

// PI-34: distinct from the (possibly softer, "leave") action above — this
// always nukes the whole org regardless of how many organizers remain. Only
// shown when there IS more than one organizer; for a solo organizer,
// "Delete account" already does this, so a second identical-looking button
// would just be confusing.
function DeleteOrganizationForm({ orgName, hasPassword }: { orgName: string; hasPassword: boolean }) {
  const navigate = useNavigate();
  const deleteOrganization = useDeleteOrganization();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const canSubmit = (!hasPassword || !!password) && confirmName.trim() === orgName && !deleteOrganization.isPending;

  return (
    <Card className="border-critical/40 p-5">
      <div className="mb-1 text-[14px] font-semibold text-critical">Delete organization</div>
      <p className="mb-3 text-[13px] text-ink-muted">
        This permanently deletes <strong>{orgName}</strong> and everything in it — every organizer, tournament, pod,
        result, and card pull. This cannot be undone.
      </p>
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Delete organization…
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmName.trim() !== orgName) return;
            deleteOrganization.mutate(
              { currentPassword: hasPassword ? password : undefined, confirmName },
              { onSuccess: () => navigate("/login") },
            );
          }}
        >
          {hasPassword && (
            <TextField type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          <TextField placeholder={`Type "${orgName}" to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {deleteOrganization.isPending ? "Deleting…" : "Permanently delete"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {deleteOrganization.isError && (
        <FormError>{codeOf(deleteOrganization.error) === "invalid_password" ? "Current password is incorrect." : "Something went wrong."}</FormError>
      )}
    </Card>
  );
}

export function AccountSection() {
  const { data: me } = useMe();
  if (!me) return null;
  const organizerCount = me.organizerCount ?? 1;
  // Undefined (login/signup cache, pre-/auth/me) is treated as "has a
  // password" — the safe default; /auth/me corrects it on first load.
  const hasPassword = me.hasPassword ?? true;
  return (
    <div className="flex flex-col gap-4">
      <ChangePasswordForm hasPassword={hasPassword} />
      <ChangeEmailForm currentEmail={me.organizer.email} hasPassword={hasPassword} />
      <DeleteAccountForm orgName={me.organization.name} email={me.organizer.email} organizerCount={organizerCount} hasPassword={hasPassword} />
      {organizerCount > 1 && <DeleteOrganizationForm orgName={me.organization.name} hasPassword={hasPassword} />}
    </div>
  );
}
