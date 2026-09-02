import type { SsoProvider } from "../features/config/useAppConfig";
import { Button } from "./ui";

// One redirect button per configured SSO provider (PI-42 / PI-43). Full-page
// navigation, not fetch — each kicks off an OAuth redirect flow.
export function SsoButtons({ providers }: { providers: SsoProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {providers.map((p) => (
        <a key={p.id} href={`/api/auth/sso/${p.id}/login`} className="block">
          <Button type="button" variant="primary" className="w-full">
            {p.id === "oidc" ? `Sign in with ${p.label}` : `Continue with ${p.label}`}
          </Button>
        </a>
      ))}
    </div>
  );
}
