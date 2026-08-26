import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useConfirmOidcRelink } from "../features/auth/useAuth";
import { Button, Card, Eyebrow, ScreenTitle } from "../components/ui";

// Landing page for the OIDC subject-relink confirmation link (PI-49). Sent to
// an organizer's existing email when their identity provider presents a
// verified email already bound to a *different* OIDC subject (e.g. a Pocket
// ID account deleted and recreated with the same mailbox) — possessing this
// link is the recovery authority, since the login itself couldn't establish
// a session. Public and works logged-out; fires the confirm once on mount.
export function OidcRelinkPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const confirm = useConfirmOidcRelink();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
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
    confirm.mutate(token, {
      onSuccess: () => setStatus("done"),
      onError: (err) => {
        setErrorCode(err instanceof ApiError ? err.message : "request_failed");
        setStatus("error");
      },
    });
  }, [token, confirm]);

  return (
    <div className="mx-auto max-w-md pt-16">
      <Eyebrow>SSO relink</Eyebrow>
      <ScreenTitle>Confirm sign-in relink</ScreenTitle>
      <Card className="mt-4 p-6">
        {status === "working" && <p className="text-ink-secondary">Confirming…</p>}
        {status === "done" && (
          <>
            <p className="mb-4 text-good">
              Your account's SSO sign-in has been relinked. For safety, every existing session and API token was
              revoked — sign in again to continue.
            </p>
            <Link to="/login">
              <Button variant="primary">Go to login</Button>
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mb-4 text-critical">
              {errorCode === "invalid_or_expired"
                ? "This link is invalid, expired, or has already been used. Try signing in again to request a new one."
                : errorCode === "missing_token"
                  ? "This link is missing its token."
                  : "Something went wrong confirming this relink."}
            </p>
            <Link to="/login">
              <Button variant="ghost">Back to login</Button>
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
