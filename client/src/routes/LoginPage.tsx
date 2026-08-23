import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLogin } from "../features/auth/useAuth";
import { Button, Card, Field, FormError, TextField } from "../components/ui";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-[380px] py-16">
      <h1 className="font-display mb-1 text-[26px] font-bold">Log in</h1>
      <p className="mb-8 text-[14px] text-ink-secondary">Back to running the tournament.</p>

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
