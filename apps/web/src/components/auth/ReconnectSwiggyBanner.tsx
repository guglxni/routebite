import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { getAuthUrl, getSwiggyStatus } from "~/lib/api";
import { useAuth } from "~/stores/auth";
import { Button } from "~/components/ui/button";

/**
 * Shows when Swiggy MCP returns 401 / SWIGGY_REAUTH_REQUIRED
 * (Builders Club: treat 401 as re-run OAuth — authenticate.md).
 */
export function ReconnectSwiggyBanner() {
  const { user, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    "Swiggy session expired. Reconnect to keep ordering and tracking."
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onReauth = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) setMessage(String(detail.message));
      setOpen(true);
    };
    window.addEventListener("routebite:swiggy-reauth", onReauth);
    return () => window.removeEventListener("routebite:swiggy-reauth", onReauth);
  }, []);

  useEffect(() => {
    if (!user || user.role !== "user") return;
    void getSwiggyStatus()
      .then((s) => {
        if (s.needsReconnect) setOpen(true);
      })
      .catch(() => undefined);
  }, [user]);

  if (!open || user?.role !== "user") return null;

  const reconnect = async () => {
    setBusy(true);
    try {
      // Prefer live Swiggy OAuth; falls back to portal login page if OAuth URL fails
      try {
        await login();
      } catch {
        const { url } = await getAuthUrl();
        window.location.href = url;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 border-b border-amber/30 bg-amber/10 px-4 py-2.5 text-sm text-text-primary backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-start gap-3 sm:items-center">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-amber" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed sm:text-sm">{message}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" className="bg-amber text-void hover:bg-amber/90" disabled={busy} onClick={() => void reconnect()}>
            Reconnect Swiggy
          </Button>
          <Link to="/login" className="hidden text-xs text-text-muted underline sm:inline">
            Portal login
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-1 text-text-muted hover:bg-white/5 hover:text-text-primary"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
