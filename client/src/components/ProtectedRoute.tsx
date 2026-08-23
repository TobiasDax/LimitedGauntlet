import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "../features/auth/useAuth";

export function ProtectedRoute() {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return <div className="py-20 text-center text-ink-muted">Loading…</div>;
  }
  if (!me) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
