import { Link } from "react-router-dom";
import { useLegalDoc } from "../features/legal/useLegalDoc";
import { RichText } from "../components/RichText";
import { Footer } from "../components/Footer";
import { Logo } from "../components/Logo";

// PI-112 — the built-in Impressum + privacy notice. Its own minimal chrome
// because the route sits outside every layout (Layout / PublicLayout /
// PlayerLayout) so it's reachable with or without a session, with or without
// an org in the URL, and outside the PI-27 public-password lock.
export function LegalPage() {
  const { data, isLoading, isError } = useLegalDoc();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[820px] items-center px-4 py-5 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-[13px] tracking-wide text-ink-secondary uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Logo className="h-7 w-7" />
          Limited Gauntlet
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[820px] flex-1 px-4 pb-24 pt-4 sm:px-8">
        {isLoading && <p className="text-[14px] text-ink-secondary">Loading…</p>}

        {isError && <p className="text-[14px] text-ink-secondary">This page couldn't be loaded. Please try again.</p>}

        {data && !data.enabled && (
          <div className="py-8">
            <h1 className="font-display mb-2 text-[24px] font-bold">Legal notice</h1>
            <p className="text-[14px] text-ink-secondary">
              This deployment doesn't publish a legal notice here. Check the site footer for the operator's own legal or
              privacy link.
            </p>
          </div>
        )}

        {data?.enabled && (
          <>
            {data.incomplete && (
              <div
                role="alert"
                className="border-warning/40 bg-warning-wash mb-6 rounded-md border px-4 py-3 text-[13px] text-ink"
              >
                <strong>This legal notice is incomplete.</strong> The operator of this deployment has not filled in the
                responsible party's name and contact address (<code>LEGAL_CONTROLLER_NAME</code> /{" "}
                <code>LEGAL_CONTROLLER_EMAIL</code>). It should not be relied on until they do.
              </div>
            )}
            <RichText text={data.markdown} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
