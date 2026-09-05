import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../features/auth/useAuth";

export function ProtectedRoute() {
  const { data: me, isLoading } = useMe();
  const { pathname } = useLocation();

  if (isLoading) {
    return <div className="py-20 text-center text-ink-muted">Loading…</div>;
  }
  if (!me) {
    return <Navigate to="/login" replace />;
  }
  // PI-86 — a valid login with no active org (multi-org account between orgs,
  // or a membership-less one) goes to the chooser. /organizations renders it.
  if (me.activeOrgId === null && pathname !== "/organizations") {
    return <Navigate to="/organizations" replace />;
  }
  return <Outlet />;
}
