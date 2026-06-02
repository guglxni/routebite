import { Link, useLocation } from "react-router-dom";
import { Home, LayoutDashboard, Package, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "~/stores/auth";
import { useProtectedNavigate } from "~/hooks/use-protected-navigate";
import { Button } from "~/components/ui/button";
import { RouteBiteLogo } from "~/components/brand/RouteBiteLogo";
import { cn } from "~/lib/utils";

const links = [
  { to: "/", label: "Home", icon: Home, protected: false },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, protected: true },
  { to: "/orders", label: "Orders", icon: Package, protected: true },
];

export function PremiumNavbar() {
  const { user, logout, devLogin } = useAuth();
  const goProtected = useProtectedNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/" ? loc.pathname === "/" : loc.pathname.startsWith(path);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#07070c]/90 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group transition-opacity hover:opacity-90">
          <RouteBiteLogo size="md" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) =>
            l.protected ? (
              <button
                key={l.to}
                type="button"
                onClick={() => goProtected(l.to)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  isActive(l.to)
                    ? "bg-white/[0.06] text-amber-light"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                <l.icon className="size-4" />
                {l.label}
              </button>
            ) : (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  isActive(l.to)
                    ? "bg-white/[0.06] text-amber-light"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                <l.icon className="size-4" />
                {l.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <span className="text-xs text-zinc-500">User #{user.id}</span>
              <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-300 hover:text-white"
                onClick={() => {
                  devLogin();
                  goProtected("/dashboard");
                }}
              >
                Dev login
              </Button>
              <Button
                size="sm"
                className="bg-amber font-semibold text-void hover:bg-amber-light"
                onClick={() => goProtected("/dashboard")}
              >
                Open dashboard
              </Button>
            </>
          )}
        </div>

        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {open && (
        <div className="border-t border-white/[0.06] bg-[#07070c] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <button
                key={l.to}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (l.protected) goProtected(l.to);
                  else window.location.assign(l.to);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                  isActive(l.to) ? "bg-amber/10 text-amber" : "text-zinc-400",
                )}
              >
                <l.icon className="size-4" />
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
