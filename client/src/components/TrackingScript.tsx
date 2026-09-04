import { useEffect } from "react";
import { useAppConfig } from "../features/config/useAppConfig";
import { buildTrackingScript } from "../lib/trackingProviders";

const SCRIPT_ELEMENT_ID = "lg-tracking-script";

// Mounted once at the app root (main.tsx), outside every route, so it loads
// on every page this app serves — authed and public alike (PI-85). Renders
// nothing; entirely inert when the deployment has no TRACKING_* env vars set
// (useAppConfig().data.tracking is null).
export function TrackingScript() {
  const { data } = useAppConfig();
  const tracking = data?.tracking;

  useEffect(() => {
    if (!tracking) return;
    if (document.getElementById(SCRIPT_ELEMENT_ID)) return; // StrictMode double-effect guard
    const script = buildTrackingScript(tracking);
    script.id = SCRIPT_ELEMENT_ID;
    document.head.appendChild(script);
  }, [tracking]);

  return null;
}
