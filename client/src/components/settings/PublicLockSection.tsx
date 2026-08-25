import { useState } from "react";
import { useMe, useSetPublicLock, useClearPublicLock } from "../../features/auth/useAuth";
import { Button, Card, FormError, TextField } from "../ui";

// PI-27 — enable/disable the org-wide public-page password lock. Off by default;
// when on, anyone opening a /o/<slug>/... link must enter the password once.
export function PublicLockSection() {
  const { data: me } = useMe();
  const setLock = useSetPublicLock();
  const clearLock = useClearPublicLock();
  const [password, setPassword] = useState("");

  const enabled = me?.publicLockEnabled ?? false;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${enabled ? "bg-good" : "bg-ink-muted"}`}
          aria-hidden="true"
        />
        <span className="text-[14px] font-semibold">
          {enabled ? "Public pages are password-protected" : "Public pages are open to anyone with the link"}
        </span>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 4) return;
          setLock.mutate(password, { onSuccess: () => setPassword("") });
        }}
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] tracking-wide text-ink-muted uppercase">
            {enabled ? "Change password" : "Set a password to enable"}
          </span>
          <TextField
            type="password"
            autoComplete="new-password"
            placeholder="At least 4 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={password.length < 4 || setLock.isPending}>
          {setLock.isPending ? "Saving…" : enabled ? "Update password" : "Enable lock"}
        </Button>
      </form>
      {setLock.isError && <FormError>Something went wrong.</FormError>}

      {enabled && (
        <Button
          variant="ghost"
          className="mt-3"
          disabled={clearLock.isPending}
          onClick={() => clearLock.mutate()}
        >
          {clearLock.isPending ? "Disabling…" : "Disable lock (make public pages open)"}
        </Button>
      )}
    </Card>
  );
}
