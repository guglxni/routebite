import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bike,
  LayoutDashboard,
  Loader2,
  Lock,
  Shield,
  UserRound,
} from "lucide-react";
import type { PortalRole } from "@routebite/shared/types";
import { toast } from "sonner";
import { RouteBiteLogo } from "~/components/brand/RouteBiteLogo";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { homePathForRole, useAuth } from "~/stores/auth";

const FALLBACK_HINTS = [
  { username: "user", password: "user123", role: "user" as const, name: "Demo Traveler", homePath: "/dashboard" },
  { username: "rider", password: "rider123", role: "rider" as const, name: "Demo Rider", homePath: "/rider" },
  { username: "admin", password: "admin123", role: "admin" as const, name: "Demo Admin", homePath: "/admin" },
];

const roleMeta: Record<
  PortalRole,
  { icon: typeof UserRound; label: string; blurb: string; accent: string }
> = {
  user: {
    icon: LayoutDashboard,
    label: "Traveler",
    blurb: "Plan routes, intercepts, and orders",
    accent: "text-amber border-amber/30 bg-amber/10",
  },
  rider: {
    icon: Bike,
    label: "Rider",
    blurb: "Active deliveries and live GPS",
    accent: "text-sky border-sky/30 bg-sky/10",
  },
  admin: {
    icon: Shield,
    label: "Admin",
    blurb: "Platform users, journeys, orders",
    accent: "text-violet-300 border-violet-400/30 bg-violet-500/10",
  },
};

export default function Login() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { token, user, hydrated, loginWithCredentials, loadPortalHints, portalHints } = useAuth();

  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("user123");
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PortalRole>("user");

  const hints = portalHints.length ? portalHints : FALLBACK_HINTS;

  useEffect(() => {
    void loadPortalHints();
  }, [loadPortalHints]);

  useEffect(() => {
    const roleQ = sp.get("role") as PortalRole | null;
    if (roleQ && roleMeta[roleQ]) {
      setSelectedRole(roleQ);
      const hint = hints.find((h) => h.role === roleQ);
      if (hint) {
        setUsername(hint.username);
        setPassword(hint.password);
      }
    }
  }, [sp, hints]);

  if (hydrated && token && user?.role) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const home = await loginWithCredentials(username.trim(), password);
      toast.success("Signed in", { description: `Opening ${home}` });
      navigate(home, { replace: true });
    } catch (err) {
      toast.error("Login failed", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const fillHint = (role: PortalRole) => {
    setSelectedRole(role);
    const hint = hints.find((h) => h.role === role);
    if (hint) {
      setUsername(hint.username);
      setPassword(hint.password);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#07070c] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(245,158,11,0.16),transparent)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.2] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col justify-center gap-10 px-4 py-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex-1 space-y-6">
          <Link to="/" className="inline-block opacity-90 transition hover:opacity-100">
            <RouteBiteLogo size="lg" />
          </Link>
          <div>
            <h1 className="font-display text-4xl font-normal tracking-tight text-white sm:text-5xl">
              Portal sign-in
            </h1>
            <p className="mt-3 max-w-md text-sm text-zinc-400">
              Isolated access for travelers, riders, and admins. Hardcoded demo credentials for now —
              each role lands in its own dashboard.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(roleMeta) as PortalRole[]).map((role) => {
              const meta = roleMeta[role];
              const Icon = meta.icon;
              const active = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => fillHint(role)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-amber/40 bg-amber/10 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <Icon className={`mb-2 size-5 ${active ? "text-amber" : "text-zinc-400"}`} />
                  <div className="text-sm font-semibold text-white">{meta.label}</div>
                  <div className="mt-1 text-xs text-zinc-500">{meta.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0a0a10]/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Sign in</h2>
              <p className="text-xs text-zinc-500">Username + password → role dashboard</p>
            </div>
            <Badge variant="outline" className={roleMeta[selectedRole].accent}>
              {roleMeta[selectedRole].label}
            </Badge>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-amber font-semibold text-void hover:bg-amber-light"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  Signing in…
                </>
              ) : (
                "Enter portal"
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-2 border-t border-white/[0.06] pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Demo accounts
            </p>
            {hints.map((h) => (
              <button
                key={h.username}
                type="button"
                onClick={() => fillHint(h.role)}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-void/40 px-3 py-2 text-left text-xs transition hover:border-amber/30"
              >
                <span className="font-mono text-zinc-300">
                  {h.username} <span className="text-zinc-600">/</span> {h.password}
                </span>
                <Badge variant="secondary" className="capitalize">
                  {h.role}
                </Badge>
              </button>
            ))}
          </div>

          <p className="mt-5 text-center text-[11px] text-zinc-600">
            <Link to="/" className="text-zinc-400 underline-offset-2 hover:text-amber hover:underline">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
