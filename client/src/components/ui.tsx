import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type ButtonVariant = "default" | "primary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  default: "bg-surface-raised border border-border-strong text-ink hover:bg-[#2c2926]",
  primary: "bg-accent border border-accent text-[#241c0a] hover:bg-accent-strong hover:border-accent-strong",
  ghost: "bg-transparent border border-transparent text-ink-secondary hover:text-ink hover:bg-surface-raised",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-[12.5px] font-semibold tracking-wide transition-colors disabled:opacity-50 disabled:pointer-events-none ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-wide text-ink-secondary">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-muted">{hint}</span>}
    </label>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
      {...props}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
      {...props}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-critical/40 bg-critical-wash px-3 py-2 text-[13px] text-critical">
      {children}
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-lg border border-border bg-surface ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11.5px] font-semibold tracking-[0.11em] text-accent uppercase">{children}</p>;
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display mb-1.5 text-[32px] font-bold text-balance">{children}</h1>;
}

export function ScreenDek({ children }: { children: ReactNode }) {
  return <p className="mb-8 max-w-[62ch] text-[14.5px] text-ink-secondary">{children}</p>;
}

export function StatusPill({ tone, children }: { tone: "good" | "warning" | "critical"; children: ReactNode }) {
  const toneClasses = {
    good: "text-good bg-good-wash",
    warning: "text-warning bg-warning-wash",
    critical: "text-critical bg-critical-wash",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide uppercase ${toneClasses[tone]}`}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {children}
    </span>
  );
}
