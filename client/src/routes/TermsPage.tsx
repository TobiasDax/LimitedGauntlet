import { Link } from "react-router-dom";
import { useTermsDoc } from "../features/legal/useTermsDoc";
import { RichText } from "../components/RichText";
import { Footer } from "../components/Footer";
import { Logo } from "../components/Logo";

// HI-10 — Terms of Service of the hosted instance. Same standalone chrome as
// /legal, for the same reasons: reachable with or without a session or org,
// and outside the PI-27 public-password lock. A self-hosted install has no
// terms, so the route answers with a short notice instead.
export function TermsPage() {
  const { data, isLoading, isError } = useTermsDoc();

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
            <h1 className="font-display mb-2 text-[24px] font-bold">Terms of Service</h1>
            <p className="text-[14px] text-ink-secondary">
              This is a self-hosted installation: there is no paid plan here, so there are no hosted-service terms. The
              software itself is covered by its open-source license.
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
                <strong>These terms are incomplete.</strong> The operator of this deployment has not filled in their
                name or support contact (<code>LEGAL_CONTROLLER_NAME</code> / <code>HOSTED_SUPPORT_EMAIL</code>).
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
