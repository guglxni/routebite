import { useNavigate } from "react-router-dom";
import { useAuth } from "~/stores/auth";

/** Navigate to protected routes — auto dev-login when no session exists. */
export function useProtectedNavigate() {
  const navigate = useNavigate();
  const { token, devLogin, hydrated } = useAuth();

  return (path: string) => {
    if (!hydrated) return;
    if (!token) devLogin();
    navigate(path);
  };
}
