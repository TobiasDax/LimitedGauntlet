import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useVerifyEmailChange } from "../features/auth/useAuth";
import { Button, Card, Eyebrow, ScreenTitle } from "../components/ui";

// Landing page for the email-change confirmation link (PI-28). Public — the
// token in the URL is the proof, so this works even if opened on a device where
// nobody's logged in. Fires the verify once on mount.
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verify = useVerifyEmailChange();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [email, setEmail] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!token) {
      setStatus("error");
      setErrorCode("missing_token");
      return;
    }
    verify.mutate(token, {
      onSuccess: (res) => {
        setEmail(res.email);
        setStatus("done");
      },
      onError: (err) => {
        setErrorCode(err instanceof ApiError ? err.message : "request_failed");
        setStatus("error");
      },
    });
  }, [token, verify]);

  return (
    <div className="mx-auto max-w-md pt-16">
      <Eyebrow>Email change</Eyebrow>
      <ScreenTitle>Confirm email</ScreenTitle>
      <Card className="mt-4 p-6">
        {status === "working" && <p className="text-ink-secondary">Confirming…</p>}
        {status === "done" && (
          <>
            <p className="mb-4 text-good">Your email is now {email}.</p>
            <Link to="/">
              <Button variant="primary">Go to dashboard</Button>
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mb-4 text-critical">
              {errorCode === "invalid_or_expired"
                ? "This link is invalid or has expired. Request a new email change from Settings."
                : errorCode === "email_taken"
                  ? "That email address is now in use by another account."
                  : errorCode === "missing_token"
                    ? "This link is missing its token."
                    : "Something went wrong confirming your email."}
            </p>
            <Link to="/">
              <Button variant="ghost">Back to app</Button>
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
