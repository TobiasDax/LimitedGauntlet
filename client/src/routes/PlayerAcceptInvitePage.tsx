import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { usePlayerInviteInfo, useAcceptPlayerInvite } from "../features/player/usePlayer";
import { Button, Card, Eyebrow, Field, FormError, ScreenTitle, TextField } from "../components/ui";

// Landing page for a player-account invite link (PI-52), at /player/accept-invite.
// Public — the token is the proof. Mirrors AcceptInvitePage; accepting sets a
// password on the player's existing roster row and lands them in the portal.
export function PlayerAcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { data: invite, isLoading, isError: inviteInvalid } = usePlayerInviteInfo(token);
  const accept = useAcceptPlayerInvite();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="mx-auto max-w-md pt-16">
        <Eyebrow>Player invite</Eyebrow>
        <ScreenTitle>Set up your login</ScreenTitle>
        <Card className="mt-4 p-6">
          <p className="text-critical">This link is missing its token.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-16">
      <Eyebrow>Player invite</Eyebrow>
      <ScreenTitle>Set up your login</ScreenTitle>
      <Card className="mt-4 p-6">
        {isLoading && <p className="text-ink-secondary">Checking invite…</p>}

        {inviteInvalid && (
          <>
            <p className="mb-4 text-critical">
              This invite is invalid or has expired. Ask an organizer to send a new one.
            </p>
            <Link to="/">
              <Button variant="ghost">Back to app</Button>
            </Link>
          </>
        )}

        {invite && (
          <>
            <p className="mb-4 text-[14px] text-ink-secondary">
              Set a password to sign in as <strong>{invite.playerName}</strong> for{" "}
              <strong>{invite.organizationName}</strong> ({invite.email}).
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
                accept.mutate(
                  { token, password },
                  { onSuccess: () => navigate(`/o/${invite.orgSlug}/player`) },
                );
              }}
            >
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
              {accept.isError && (
                <FormError>
                  {accept.error instanceof ApiError && accept.error.message === "email_taken"
                    ? "That email is already in use — ask an organizer."
                    : accept.error instanceof ApiError && accept.error.message === "invalid_or_expired"
                      ? "This invite is invalid or has expired."
                      : "Something went wrong."}
                </FormError>
              )}
              <Button type="submit" variant="primary" disabled={!password || accept.isPending}>
                {accept.isPending ? "Setting up…" : "Set password & sign in"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
