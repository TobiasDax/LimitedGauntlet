import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSignup, useSignupStatus } from "../features/auth/useAuth";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { ApiError } from "../lib/api";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [organizerName, setOrganizerName] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [organizerPassword, setOrganizerPassword] = useState("");
  const signup = useSignup();
  const navigate = useNavigate();
  const { data: signupStatus, isLoading: statusLoading } = useSignupStatus();

  return (
    <div className="mx-auto max-w-[420px] py-16">
      <h1 className="font-display mb-1 text-[26px] font-bold">Create your organization</h1>
      <p className="mb-8 text-[14px] text-ink-secondary">
        One organization per playgroup — your roster and tournaments live under it.
      </p>

      {statusLoading ? null : !signupStatus?.allowSignup ? (
        <Card className="p-6 text-center">
          <p className="text-[14px] text-ink-secondary">
            Signups are closed right now. Ask whoever's running this instance for an invite, or to open signups
            briefly.
          </p>
        </Card>
      ) : (
        <Card className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            signup.mutate(
              { orgName, orgSlug, organizerName, organizerEmail, organizerPassword },
              { onSuccess: () => navigate("/") },
            );
          }}
        >
          <Field label="Organization name" hint="e.g. your playgroup's name">
            <TextField
              required
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!slugTouched) setOrgSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="URL slug" hint="Used in shareable links — lowercase, numbers, hyphens">
            <TextField
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              value={orgSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setOrgSlug(slugify(e.target.value));
              }}
            />
          </Field>
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
                ? signup.error.message === "slug_taken"
                  ? "That URL slug is already taken — try a different one."
                  : "That email is already in use."
                : signup.error instanceof ApiError && signup.error.status === 403
                  ? "Signups just closed — ask whoever's running this instance."
                  : "Something went wrong. Try again."}
            </FormError>
          )}

          <Button type="submit" variant="primary" disabled={signup.isPending}>
            {signup.isPending ? "Creating…" : "Create organization"}
          </Button>
        </form>
        </Card>
      )}

      <p className="mt-5 text-center text-[13px] text-ink-secondary">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:text-accent-strong">
          Log in
        </Link>
      </p>
    </div>
  );
}
