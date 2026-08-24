import logoUrl from "../assets/logo.png";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return <img src={logoUrl} alt="" className={`rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)] ${className}`} />;
}
