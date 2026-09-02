import { useState } from "react";
import { ApiError } from "../../lib/api";
import { useMe } from "../../features/auth/useAuth";
import {
  useOrganizers,
  useInviteOrganizer,
  useCancelInvite,
  useRemoveOrganizer,
} from "../../features/organizers/useOrganizers";
import { Button, Card, FormError, TextField } from "../ui";
import { SharePopup } from "../SharePopup";

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "request_failed";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Co-organizer management (PI-34). Roles are equal for v1 — anyone here can
// invite, remove others, or (from the Account section) leave/delete.
export function OrganizersSection() {
  const { data: me } = useMe();
  const { data, isLoading } = useOrganizers();
  const inviteOrganizer = useInviteOrganizer();
  const cancelInvite = useCancelInvite();
  const removeOrganizer = useRemoveOrganizer();
  const [email, setEmail] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(null);

  const errorCode = inviteOrganizer.isError ? codeOf(inviteOrganizer.error) : null;
  const errorText =
    errorCode === "email_taken"
      ? "That email already has an account."
      : errorCode
        ? "Something went wrong."
        : null;

  return (
    <div>
      {shareLink && (
        <SharePopup
          url={shareLink}
          title="Co-organizer invite link"
          onClose={() => setShareLink(null)}
        />
      )}

      <Card className="mb-6 p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            inviteOrganizer.mutate(email.trim(), {
              onSuccess: (res) => {
                setEmail("");
                setShareLink(res.link);
              },
            });
          }}
        >
          <TextField
            className="flex-1"
            type="email"
            placeholder="Email to invite"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!email.trim() || inviteOrganizer.isPending}>
            {inviteOrganizer.isPending ? "Inviting…" : "Invite"}
          </Button>
        </form>
        {errorText && <FormError>{errorText}</FormError>}
      </Card>

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <>
          <Card className="mb-4 divide-y divide-border">
            {data?.organizers.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="font-display text-[15px] font-bold">
                    {o.name}
                    {o.id === me?.organizer.id && (
                      <span className="ml-2 text-[11px] font-normal tracking-wide text-ink-muted uppercase">you</span>
                    )}
                  </div>
                  <div className="text-[12px] text-ink-muted">
                    {o.email} · joined {formatDate(o.createdAt)}
                  </div>
                </div>
                {o.id !== me?.organizer.id && (
                  <Button
                    variant="ghost"
                    onClick={() => removeOrganizer.mutate(o.id)}
                    disabled={removeOrganizer.isPending}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </Card>

          {data && data.invites.length > 0 && (
            <Card className="divide-y divide-border">
              {data.invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <div className="font-display text-[15px] font-bold">{i.email}</div>
                    <div className="text-[12px] text-ink-muted">
                      Invited by {i.invitedByName} · expires {formatDate(i.expiresAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      disabled={inviteOrganizer.isPending}
                      onClick={() =>
                        inviteOrganizer.mutate(i.email, {
                          onSuccess: (res) => setShareLink(res.link),
                        })
                      }
                    >
                      Copy link
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => cancelInvite.mutate(i.id)}
                      disabled={cancelInvite.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
