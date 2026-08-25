import type { ReactNode } from "react";

// One titled block on the Settings page. Sections stack; each gets a display
// heading + optional description, then its own body. Shared so PI-27 (public
// page lock) and PI-28 (account management) drop in with consistent styling.
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border mt-10 border-t pt-8 first:mt-6 first:border-t-0 first:pt-0">
      <h2 className="font-display text-[20px] font-bold">{title}</h2>
      {description && <p className="mt-1 mb-4 max-w-2xl text-[13px] text-ink-muted">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}
