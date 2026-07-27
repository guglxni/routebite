import { useNavigate } from "react-router-dom";
import { homePathForRole, useAuth } from "~/stores/auth";

/** Navigate to the signed-in role home, or /login if no session. */
export function useProtectedNavigate() {
  const navigate = useNavigate();
  const { token, hydrated, ensureSession } = useAuth();

  return async (path?: string) => {
    if (!hydrated) return;

    // Explicit login portal
    if (!path || path === "/login" || path.startsWith("/login?")) {
      if (token) {
        const ok = await ensureSession();
        const user = useAuth.getState().user;
        if (ok && user) {
          navigate(homePathForRole(user.role));
          return;
        }
      }
      navigate(path && path.startsWith("/login") ? path : "/login");
      return;
    }

    const ok = token ? await ensureSession() : false;
    const user = useAuth.getState().user;
    if (!ok || !user) {
      navigate("/login");
      return;
    }

    const role = user.role;
    if (path.startsWith("/rider") && role !== "rider") {
      navigate(homePathForRole(role));
      return;
    }
    if (path.startsWith("/admin") && role !== "admin") {
      navigate(homePathForRole(role));
      return;
    }
    if (
      (path.startsWith("/dashboard") ||
        path.startsWith("/routes") ||
        path.startsWith("/intercepts") ||
        path.startsWith("/orders") ||
        path.startsWith("/menu") ||
        path.startsWith("/order") ||
        path.startsWith("/track")) &&
      role !== "user"
    ) {
      navigate(homePathForRole(role));
      return;
    }
    navigate(path);
  };
}
