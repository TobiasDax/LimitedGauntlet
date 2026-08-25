import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import {
  useMe,
  useChangePassword,
  useRequestEmailChange,
  useDeleteAccount,
} from "../../features/auth/useAuth";
import { Button, Card, FormError, TextField } from "../ui";

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "request_failed";
}

function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-3 text-[14px] font-semibold">Change password</div>
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
            { currentPassword: current, newPassword: next },
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
        <TextField type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField type="password" autoComplete="new-password" placeholder="New password (min 8)" value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div>
          <Button type="submit" variant="primary" disabled={!current || !next || changePassword.isPending}>
            {changePassword.isPending ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
      {localError && <FormError>{localError}</FormError>}
      {changePassword.isError && (
        <FormError>{codeOf(changePassword.error) === "invalid_password" ? "Current password is incorrect." : "Something went wrong."}</FormError>
      )}
      {done && <p className="mt-2 text-[13px] text-good">Password changed.</p>}
    </Card>
  );
}

function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
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
            { currentPassword: current, newEmail },
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
        <TextField type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField type="email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <div>
          <Button type="submit" variant="primary" disabled={!current || !newEmail || requestChange.isPending}>
            {requestChange.isPending ? "Sending…" : "Send confirmation link"}
          </Button>
        </div>
      </form>
      {errorText && <FormError>{errorText}</FormError>}
      {sent && <p className="mt-2 text-[13px] text-good">Check your new inbox for a confirmation link (expires in 1 hour).</p>}
    </Card>
  );
}

function DeleteAccountForm({ orgName }: { orgName: string }) {
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");

  return (
    <Card className="border-critical/40 p-5">
      <div className="mb-1 text-[14px] font-semibold text-critical">Delete account</div>
      <p className="mb-3 text-[13px] text-ink-muted">
        This permanently deletes your organization <strong>{orgName}</strong> and everything in it — every tournament,
        pod, result, and card pull. This cannot be undone.
      </p>
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmName.trim() !== orgName) return;
            deleteAccount.mutate(
              { currentPassword: password, confirmName },
              { onSuccess: () => navigate("/login") },
            );
          }}
        >
          <TextField type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextField placeholder={`Type "${orgName}" to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={!password || confirmName.trim() !== orgName || deleteAccount.isPending}
            >
              {deleteAccount.isPending ? "Deleting…" : "Permanently delete"}
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

export function AccountSection() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <div className="flex flex-col gap-4">
      <ChangePasswordForm />
      <ChangeEmailForm currentEmail={me.organizer.email} />
      <DeleteAccountForm orgName={me.organization.name} />
    </div>
  );
}
