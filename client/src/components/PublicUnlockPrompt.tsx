import { useState } from "react";
import { useUnlockPublic } from "../features/public/usePublic";
import { Logo } from "./Logo";
import { Button, Card, FormError, TextField } from "./ui";

// Shown by PublicLayout when an org's public pages are password-locked (PI-27)
// and this visitor hasn't unlocked them yet. A correct password sets a session
// cookie server-side; the lock-status query then re-resolves to unlocked and
// the real content renders.
export function PublicUnlockPrompt({ slug }: { slug: string | undefined }) {
  const unlock = useUnlockPublic(slug);
  const [password, setPassword] = useState("");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="font-display mb-6 flex items-center gap-2.5 text-[19px] font-bold">
        <Logo className="h-7 w-7" />
        LimitedGauntlet
      </div>
      <Card className="w-full p-6">
        <h1 className="font-display mb-1 text-[20px] font-bold">This page is private</h1>
        <p className="mb-4 text-[13px] text-ink-secondary">Enter the password to view it.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!password) return;
            unlock.mutate(password);
          }}
        >
          <TextField
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" className="mt-3 w-full" disabled={!password || unlock.isPending}>
            {unlock.isPending ? "Checking…" : "Unlock"}
          </Button>
        </form>
        {unlock.isError && <FormError>Incorrect password.</FormError>}
      </Card>
    </div>
  );
}
