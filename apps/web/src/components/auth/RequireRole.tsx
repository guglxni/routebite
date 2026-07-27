import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import type { PortalRole } from "@routebite/shared/types";
import { homePathForRole, useAuth } from "~/stores/auth";

type RequireRoleProps = {
  roles: PortalRole[];
  children: React.ReactNode;
};

/** Auth + role gate. Wrong role is redirected to that role's home (never cross-dashboards). */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { token, user, hydrated, ensureSession, sessionError } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!token) void ensureSession();
  }, [hydrated, token, ensureSession]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void text-sm text-zinc-400">
        Loading session…
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  if (sessionError && !user.id) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-void px-4 text-center text-sm text-zinc-400">
        <p>{sessionError}</p>
        <Navigate to="/login" replace />
      </div>
    );
  }

  return <>{children}</>;
}
