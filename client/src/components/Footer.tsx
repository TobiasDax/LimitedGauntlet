import { useAppConfig } from "../features/config/useAppConfig";

const GITHUB_URL = "https://github.com/TobiasDax/LimitedGauntlet";

const linkClass =
  "text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Shared footer for both the authed Layout and the public PublicLayout.
// GitHub + License are always present (this is OSS); the legal link is
// deployer-configured (LEGAL_LINK_URL/LEGAL_LINK_LABEL) and only renders
// when set — no Impressum/Privacy content ships with the app itself.
export function Footer() {
  const { data } = useAppConfig();

  return (
    <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-6 text-center sm:px-8">
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        GitHub
      </a>
      <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className={linkClass}>
        License
      </a>
      {data?.legalLinkUrl && data.legalLinkLabel && (
        <a href={data.legalLinkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {data.legalLinkLabel}
        </a>
      )}
    </footer>
  );
}
