import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { usePlayerLogin, usePlayerMe } from "../features/player/usePlayer";
import { Button, Card, Eyebrow, Field, FormError, ScreenTitle, TextField } from "../components/ui";

// Player self-service login (PI-52), at /o/:slug/player/login. Org-scoped —
// the slug in the path picks the organization, so a player only needs their
// email + password. Organizers still use /login.
export function PlayerLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: me } = usePlayerMe();
  const login = usePlayerLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (me) return <Navigate to={`/o/${slug}/player`} replace />;

  return (
    <div className="pt-8">
      <Eyebrow>Players</Eyebrow>
      <ScreenTitle>Sign in</ScreenTitle>
      <p className="mb-6 max-w-[52ch] text-[14px] text-ink-secondary">
        Check yourself into tournaments and report your own match results. Ask an organizer for an
        invite link if you don't have a login yet.
      </p>
      <Card className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate(
              { orgSlug: slug ?? "", email, password },
              { onSuccess: () => navigate(`/o/${slug}/player`) },
            );
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
              {login.error instanceof ApiError && login.error.message === "invalid_credentials"
                ? "Wrong email or password."
                : "Something went wrong. Try again."}
            </FormError>
          )}
          <Button type="submit" variant="primary" disabled={!email || !password || login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
