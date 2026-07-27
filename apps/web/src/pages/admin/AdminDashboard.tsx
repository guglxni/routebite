import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Bike,
  Loader2,
  Package,
  RefreshCw,
  Route,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAdminFleet,
  getAdminHealthDetail,
  getAdminJourneys,
  getAdminOrders,
  getAdminOverview,
  getAdminTrackingRecent,
  getAdminUsers,
  patchAdminOrder,
  patchAdminUser,
  getAdminFusion,
  tickAdminFusion,
  type RiderPresence,
} from "~/lib/api";
import type { PortalRole } from "@routebite/shared/types";
import { JourneyMap } from "~/components/map/JourneyMap";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useAuth } from "~/stores/auth";
import { BorderBeam } from "~/components/ui/border-beam";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "orders";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getAdminOverview>> | null>(
    null,
  );
  const [users, setUsers] = useState<Awaited<ReturnType<typeof getAdminUsers>>>([]);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof getAdminOrders>>>([]);
  const [journeys, setJourneys] = useState<Awaited<ReturnType<typeof getAdminJourneys>>>([]);
  const [fleet, setFleet] = useState<Awaited<ReturnType<typeof getAdminFleet>>>([]);
  const [tracking, setTracking] = useState<Awaited<ReturnType<typeof getAdminTrackingRecent>>>([]);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof getAdminHealthDetail>> | null>(
    null,
  );
  const [fusion, setFusion] = useState<Awaited<ReturnType<typeof getAdminFusion>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<string>("");
  const [focusRiderId, setFocusRiderId] = useState<number | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [o, u, ord, j, f, t, h, fus] = await Promise.all([
        getAdminOverview(),
        getAdminUsers(),
        getAdminOrders(40, orderFilter || undefined),
        getAdminJourneys(30),
        getAdminFleet(),
        getAdminTrackingRecent(),
        getAdminHealthDetail(),
        getAdminFusion().catch(() => null),
      ]);
      setOverview(o);
      setUsers(u);
      setOrders(ord);
      setJourneys(j);
      setFleet(f);
      setTracking(t);
      setHealth(h);
      setFusion(fus);
    } catch (err) {
      toast.error("Admin feed failed", { description: (err as Error).message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [orderFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = window.setInterval(() => void refresh(true), 20000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const riders = useMemo(() => users.filter((u) => u.role === "rider"), [users]);

  const fleetMarkers = useMemo(
    () =>
      fleet
        .filter((r) => r.location)
        .map((r) => ({
          id: `rider-${r.id}`,
          lat: r.location!.lat,
          lng: r.location!.lng,
          label: r.name ?? r.username ?? `Rider ${r.id}`,
          tone: r.presence as "online" | "busy" | "offline",
        })),
    [fleet],
  );

  const fleetCenter = useMemo(() => {
    const focused = fleet.find((r) => r.id === focusRiderId && r.location);
    if (focused?.location) return focused.location;
    const withLoc = fleet.find((r) => r.location);
    if (withLoc?.location) return withLoc.location;
    const drop = orders.find((o) => o.dropoff?.lat != null);
    if (drop?.dropoff?.lat != null && drop.dropoff.lng != null) {
      return { lat: drop.dropoff.lat, lng: drop.dropoff.lng };
    }
    return { lat: 12.9716, lng: 77.5946 };
  }, [fleet, orders, focusRiderId]);

  const onAssign = async (orderId: string, riderId: number | null) => {
    setBusy(orderId);
    try {
      await patchAdminOrder(orderId, { riderId });
      toast.success(riderId ? "Rider assigned" : "Rider unassigned");
      await refresh(true);
    } catch (err) {
      toast.error("Assign failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const onCancelOrder = async (orderId: string) => {
    if (!window.confirm("Cancel this order? This cannot be undone from the console.")) return;
    setBusy(orderId);
    try {
      await patchAdminOrder(orderId, { status: "cancelled" });
      toast.success("Order cancelled");
      await refresh(true);
    } catch (err) {
      toast.error("Cancel failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const onRole = async (userId: number, role: PortalRole) => {
    setBusy(`user-${userId}`);
    try {
      await patchAdminUser(userId, { role });
      toast.success(`Role → ${role}`);
      await refresh(true);
    } catch (err) {
      toast.error("Role update failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const onRevoke = async (userId: number) => {
    setBusy(`user-${userId}`);
    try {
      await patchAdminUser(userId, { revokeSession: true });
      toast.success("Session revoked");
      await refresh(true);
    } catch (err) {
      toast.error("Revoke failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const presenceColor = (p: RiderPresence) =>
    p === "busy" ? "text-amber" : p === "online" ? "text-emerald" : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <PageHeader
        eyebrow="Admin"
        title="Fleet & control"
        description="Presence, assignments, roles, and live tracking — kept separate from traveler tools."
        actions={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {[
          { label: "Users", value: overview?.users, icon: Users },
          { label: "Active orders", value: overview?.activeOrders, icon: Package },
          { label: "Unassigned", value: overview?.unassignedOrders, icon: Activity },
          { label: "Riders online", value: overview?.ridersOnline, icon: Bike },
          { label: "Delivered", value: overview?.deliveredOrders, icon: Shield },
          {
            label: "Avg align",
            value: overview?.avgAlignmentScore ?? "—",
            icon: Route,
          },
        ].map((s) => (
          <Card key={s.label} className="glass border-border-subtle">
            <CardContent className="flex items-center gap-3 p-4">
              <s.icon className="size-5 text-violet-300" />
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xl font-bold tabular-nums">{s.value ?? "—"}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {overview?.usersByRole && overview.usersByRole.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {overview.usersByRole.map((r) => (
            <Badge key={r.role} variant="outline" className="capitalize">
              {r.role}: {r.count}
            </Badge>
          ))}
          {health && (
            <Badge variant="secondary">DB {health.database}</Badge>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <JourneyMap
            origin={fleetCenter}
            destination={null}
            fleetMarkers={fleetMarkers}
            intercepts={orders
              .filter((o) => o.dropoff?.lat != null && o.dropoff?.lng != null)
              .slice(0, 12)
              .map((o) => ({
                id: o.id,
                lat: o.dropoff!.lat!,
                lng: o.dropoff!.lng!,
                type: "dynamic",
                score: o.riderId ? 80 : 40,
                dwellTime: 120,
                restaurantCount: 0,
                safetyRating: 7,
                name: o.dropoff?.name ?? o.id.slice(0, 8),
              }))}
            showArcs={false}
            showIsochrones={false}
            heightClassName="h-[360px] md:h-[420px]"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Dropoffs (higher score = assigned) + all rider GPS pins (green online / amber busy).
          </p>
        </div>

        <div className="xl:col-span-2">
          <Card className="glass border-border-subtle h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fleet</CardTitle>
              <CardDescription>Click a rider to focus the map</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {fleet.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No rider accounts.</p>
              ) : (
                fleet.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setFocusRiderId(r.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      focusRiderId === r.id
                        ? "border-violet-400/50 bg-violet-500/10"
                        : "border-border-subtle hover:border-violet-400/30"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{r.name ?? r.username ?? `Rider ${r.id}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.activeJobs} active ·{" "}
                        {r.location
                          ? `${r.location.lat.toFixed(3)}, ${r.location.lng.toFixed(3)}`
                          : "no GPS"}
                      </div>
                    </div>
                    <Badge variant="outline" className={`capitalize ${presenceColor(r.presence)}`}>
                      {r.presence}
                    </Badge>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="glass border-border-subtle">
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Assign, cancel, manage roles, inspect tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="journeys">Journeys</TabsTrigger>
              <TabsTrigger value="fusion">Fusion</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {["", "pending", "out_for_delivery", "delivered", "cancelled"].map((s) => (
                  <Button
                    key={s || "all"}
                    size="xs"
                    variant={orderFilter === s ? "default" : "outline"}
                    onClick={() => setOrderFilter(s)}
                  >
                    {s ? s.replace(/_/g, " ") : "all"}
                  </Button>
                ))}
              </div>
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-col gap-2 rounded-xl border border-border-subtle px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="font-mono text-xs">#{o.id.slice(0, 10)}</span>
                    <span className="ml-2 capitalize text-muted-foreground">
                      {o.server} · user {o.userId ?? "—"} · rider {o.riderId ?? "unassigned"}
                    </span>
                    {o.dropoff?.name && (
                      <p className="mt-0.5 text-xs text-text-secondary">{o.dropoff.name}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{o.status.replace(/_/g, " ")}</Badge>
                    <select
                      className="h-7 rounded-md border border-border-subtle bg-void px-2 text-xs"
                      value={o.riderId ?? ""}
                      disabled={busy === o.id}
                      onChange={(e) => {
                        const v = e.target.value;
                        void onAssign(o.id, v ? Number(v) : null);
                      }}
                    >
                      <option value="">Unassigned</option>
                      {riders.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name ?? r.username ?? r.id}
                        </option>
                      ))}
                    </select>
                    {o.status !== "cancelled" && o.status !== "delivered" && (
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={busy === o.id}
                        onClick={() => void onCancelOrder(o.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No orders.</p>
              )}
            </TabsContent>

            <TabsContent value="users" className="mt-4 space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-2 rounded-xl border border-border-subtle px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="font-medium">{u.name ?? u.username ?? `User ${u.id}`}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-7 rounded-md border border-border-subtle bg-void px-2 text-xs capitalize"
                      value={u.role}
                      disabled={busy === `user-${u.id}` || u.id === user?.id}
                      onChange={(e) => void onRole(u.id, e.target.value as PortalRole)}
                    >
                      <option value="user">user</option>
                      <option value="rider">rider</option>
                      <option value="admin">admin</option>
                    </select>
                    <Badge variant={u.sessionActive ? "outline" : "secondary"}>
                      {u.sessionActive ? "session ok" : "expired"}
                    </Badge>
                    {u.sessionActive && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy === `user-${u.id}`}
                        onClick={() => void onRevoke(u.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="journeys" className="mt-4 space-y-2">
              {journeys.map((j) => (
                <div
                  key={j.id}
                  className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">#{j.id.slice(0, 10)}</span>
                    <Badge variant="outline" className="capitalize">
                      {j.transportMode} · {j.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-text-secondary">
                    {j.originAddress} → {j.destAddress}
                  </p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="fusion" className="mt-4 space-y-4">
              <Card className="relative overflow-hidden border-amber/30 bg-amber/5">
                <BorderBeam duration={8} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="size-4 text-amber" />
                    Maps × Swiggy fusion
                  </CardTitle>
                  <CardDescription>
                    Deferred placer queue, alignment health, halt failures
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3 text-sm">
                  <Badge variant="outline">
                    Deferred pending · {fusion?.deferredPending ?? 0}
                  </Badge>
                  <Badge variant="outline" className="text-rose">
                    Deferred failed · {fusion?.deferredFailed ?? 0}
                  </Badge>
                  <Badge variant="secondary">
                    Avg alignment · {fusion?.avgAlignmentScore ?? overview?.avgAlignmentScore ?? "—"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === "fusion-tick"}
                    onClick={async () => {
                      setBusy("fusion-tick");
                      try {
                        const r = await tickAdminFusion();
                        toast.success(`Tick: ${r.due} due, ${r.placed} placed`);
                        await refresh(true);
                      } catch (err) {
                        toast.error("Tick failed", {
                          description: (err as Error).message,
                        });
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Force placer tick
                  </Button>
                </CardContent>
              </Card>
              <div className="space-y-2">
                {(fusion?.queue ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No deferred orders waiting.</p>
                )}
                {(fusion?.queue ?? []).map((q) => (
                  <div
                    key={q.id}
                    className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs">#{q.id.slice(0, 12)}</span>
                      <Badge variant="outline" className="capitalize">
                        {q.server} · attempt {q.placeAttempts ?? 0}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Auto-place{" "}
                      {q.autoPlaceAt
                        ? new Date(q.autoPlaceAt).toLocaleString("en-IN")
                        : "—"}
                      {q.mealQueryHint ? ` · meal ${q.mealQueryHint}` : ""}
                    </p>
                    {q.lastPlaceError && (
                      <p className="mt-1 text-xs text-rose">{q.lastPlaceError}</p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="system" className="mt-4 space-y-4">
              <div className="rounded-xl border border-border-subtle p-3 text-sm">
                <p className="font-medium">Health</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>Database: {health?.database ?? "—"}</li>
                  <li>Portal mode: {health?.portalMode ?? "—"}</li>
                  <li>Active orders: {health?.activeOrders ?? "—"}</li>
                  <li>API time: {health?.apiTime ?? "—"}</li>
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Recent tracking pings</p>
                <div className="max-h-64 space-y-1.5 overflow-auto">
                  {tracking.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-border-subtle px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground"
                    >
                      #{t.orderId.slice(0, 10)} · rider{" "}
                      {t.riderLat != null
                        ? `${t.riderLat.toFixed(4)},${t.riderLng?.toFixed(4)}`
                        : "—"}{" "}
                      · ETA {t.riderETA ?? "—"}s · align {t.alignmentScore ?? "—"}
                    </div>
                  ))}
                  {tracking.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tracking events yet.</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
