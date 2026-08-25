import logoUrl from "../assets/logo.png";

// No rounding/border treatment here — unlike the old boxed-icon logo, this
// artwork has a transparent background and is meant to float freely; a
// bounding-box border would draw a visible frame across the transparent
// regions.
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return <img src={logoUrl} alt="" className={className} />;
}
