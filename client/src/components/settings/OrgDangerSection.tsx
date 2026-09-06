import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useMe, useDeleteAccount } from "../../features/auth/useAuth";
import { useDeleteOrganization } from "../../features/organizers/useOrganizers";
import { Button, Card, FormError, TextField } from "../ui";

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "request_failed";
}

// PI-87 — the destructive org actions, moved off the old Account section onto
// /settings (they act on the active org, not the identity). PI-42 follow-up:
// an SSO-only account (hasPassword false) confirms with the typed name alone.
// PI-34/PI-86: with co-organizers, this "leaves" (drops the membership,
// session stays alive → the chooser); solo, it deletes the whole org.
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
      <div className="mb-1 text-[14px] font-semibold text-critical">
        {leaving ? "Leave organization" : "Delete organization"}
      </div>
      <p className="mb-3 text-[13px] text-ink-muted">
        {leaving ? (
          <>
            This removes your access to <strong>{orgName}</strong>. The other{" "}
            {organizerCount - 1 === 1 ? "organizer keeps" : "organizers keep"} theirs and nothing else changes. You stay
            logged in.
          </>
        ) : (
          <>
            This permanently deletes <strong>{orgName}</strong> and everything in it — every tournament, pod, result,
            and card pull. This cannot be undone.
          </>
        )}
      </p>
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {leaving ? "Leave organization…" : "Delete organization…"}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmName.trim() !== expected) return;
            deleteAccount.mutate(
              { currentPassword: hasPassword ? password : undefined, confirmName },
              // "leave" keeps you logged in (route to the chooser); a solo
              // delete logs you out.
              { onSuccess: (data) => navigate(data?.left ? "/organizations" : "/login") },
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

// Shown only when there IS more than one organizer — for a solo organizer the
// form above already deletes the whole org, so a second identical-looking
// button would just confuse.
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

export function OrgDangerSection() {
  const { data: me } = useMe();
  if (!me?.organization) return null;
  const organizerCount = me.organizerCount ?? 1;
  const hasPassword = me.hasPassword ?? true;
  return (
    <div className="flex flex-col gap-4">
      <DeleteAccountForm
        orgName={me.organization.name}
        email={me.organizer.email}
        organizerCount={organizerCount}
        hasPassword={hasPassword}
      />
      {organizerCount > 1 && <DeleteOrganizationForm orgName={me.organization.name} hasPassword={hasPassword} />}
    </div>
  );
}
