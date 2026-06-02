import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  CloudRain,
  MapPin,
  Navigation,
  Package,
  Route,
  TrendingUp,
  Loader2,
} from "lucide-react";
import CountUp from "~/components/CountUp";
import GradientText from "~/components/GradientText";
import SpotlightCard from "~/components/SpotlightCard";
import { useAuth } from "~/stores/auth";
import { useOrders } from "~/stores/orders";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import type { TransportMode } from "@routebite/shared/types";

const demoPlaces = [
  "Koramangala, Bengaluru",
  "Indiranagar, Bengaluru",
  "MG Road, Bengaluru",
  "Whitefield, Bengaluru",
  "Electronic City, Bengaluru",
  "Hebbal, Bengaluru",
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, hydrated } = useAuth();
  const { all, fetchOrders } = useOrders();
  const { current, intercepts, buildJourney, loading, setSelectedIntercept } = useJourney();

  const [from, setFrom] = useState("Koramangala, Bengaluru");
  const [to, setTo] = useState("Whitefield, Bengaluru");
  const [mode, setMode] = useState<TransportMode>("car");
  const [tab, setTab] = useState<"active" | "past">("active");

  useEffect(() => {
    if (hydrated) fetchOrders();
  }, [hydrated, fetchOrders]);

  const activeOrders = all.filter((o) =>
    ["pending", "confirmed", "preparing", "out_for_delivery"].includes(o.status),
  );
  const pastOrders = all.filter((o) =>
    ["delivered", "cancelled", "failed"].includes(o.status),
  );
  const displayOrders = tab === "active" ? activeOrders : pastOrders;

  const avgInterceptScore = useMemo(() => {
    if (!intercepts.length) return 0;
    return intercepts.reduce((sum, p) => sum + p.score, 0) / intercepts.length;
  }, [intercepts]);

  const onPlanRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    try {
      await buildJourney({
        originAddress: from.trim(),
        destinationAddress: to.trim(),
        transportMode: mode,
      });
      const count = useJourney.getState().intercepts.length;
      toast.success("Route analyzed", {
        description: `${count} intercept points ready along your journey.`,
      });
    } catch (err) {
      toast.error("Route failed", { description: (err as Error).message });
    }
  };

  const origin = current
    ? { lat: current.originLat, lng: current.originLng }
    : null;
  const destination = current
    ? { lat: current.destinationLat, lng: current.destinationLng }
    : null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">
          {user?.name ? (
            <>
              Hey,{" "}
              <GradientText colors={["#fbbf24", "#f59e0b", "#fcd34d"]} className="text-3xl">
                {user.name.split(" ")[0]}
              </GradientText>
            </>
          ) : (
            "Route command center"
          )}
        </h1>
        <p className="text-text-secondary text-sm max-w-2xl">
          Plan journeys with live Google Maps routing, discover intercept stops, order from Swiggy, and track alignment — all in one dashboard.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3 flex flex-col gap-4">
          {loading && !current ? (
            <Skeleton className="h-[420px] w-full rounded-xl" />
          ) : (
            <JourneyMap
              origin={origin}
              destination={destination}
              routePoints={current?.routePoints}
              intercepts={intercepts}
              selectedInterceptId={null}
              onSelectIntercept={(id) => {
                setSelectedIntercept(id);
                navigate(`/intercepts`);
              }}
              heightClassName="h-[420px] md:h-[480px]"
            />
          )}

          {current && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-amber/30 text-amber">
                {current.originAddress}
              </Badge>
              <ArrowRight className="size-4 text-muted-foreground self-center" />
              <Badge variant="outline" className="border-emerald/30 text-emerald">
                {current.destinationAddress}
              </Badge>
              {current.hasTolls && (
                <Badge variant="secondary">Toll route detected</Badge>
              )}
              {(current.weatherWarnings?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <CloudRain className="size-3" />
                  {current.weatherWarnings!.length} weather alerts
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Route className="size-5 text-amber" />
                Quick route
              </CardTitle>
              <CardDescription>
                Uses live geocoding, traffic-aware routing, and intercept scoring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onPlanRoute} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="origin">Origin</Label>
                  <Input
                    id="origin"
                    list="rb-places"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="Where are you starting?"
                    className="bg-surface-raised border-border-subtle"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Input
                    id="destination"
                    list="rb-places"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Where are you headed?"
                    className="bg-surface-raised border-border-subtle"
                  />
                </div>
                <datalist id="rb-places">
                  {demoPlaces.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-2">
                  {(["car", "bus", "train", "bike"] as TransportMode[]).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={mode === m ? "default" : "outline"}
                      onClick={() => setMode(m)}
                      className={mode === m ? "bg-amber text-void hover:bg-amber-light" : ""}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber text-void hover:bg-amber-light"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                      Analyzing route…
                    </>
                  ) : (
                    <>
                      Find intercepts
                      <ArrowRight className="size-4" data-icon="inline-end" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: Navigation,
                label: "Distance",
                value: current?.distanceMeters
                  ? current.distanceMeters >= 1000
                    ? current.distanceMeters / 1000
                    : current.distanceMeters
                  : null,
                suffix: current?.distanceMeters
                  ? current.distanceMeters >= 1000
                    ? " km"
                    : " m"
                  : "",
              },
              {
                icon: Clock,
                label: "ETA",
                value: current?.durationSeconds ?? current?.estimatedDuration
                  ? Math.round((current.durationSeconds ?? current.estimatedDuration ?? 0) / 60)
                  : null,
                suffix: " min",
              },
              {
                icon: MapPin,
                label: "Intercepts",
                value: intercepts.length || current?.interceptCount || null,
              },
              {
                icon: TrendingUp,
                label: "Avg score",
                value: avgInterceptScore || null,
              },
            ].map((stat) => (
              <SpotlightCard
                key={stat.label}
                className="rounded-xl border border-border-subtle bg-surface-raised/30 p-4"
                spotlightColor="rgba(245, 158, 11, 0.08)"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <stat.icon className="size-3.5" />
                  {stat.label}
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {stat.value != null ? (
                    <>
                      <CountUp
                        to={stat.value}
                        duration={1.4}
                      />
                      {stat.suffix && <span className="text-amber">{stat.suffix}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </SpotlightCard>
            ))}
          </div>

          {current && intercepts.length > 0 && (
            <Card className="glass border-border-subtle">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top intercept</CardTitle>
                <CardDescription>Highest-scored stop on your route</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(() => {
                  const top = [...intercepts].sort((a, b) => b.score - a.score)[0]!;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{top.type} stop</span>
                        <Badge className="bg-amber/15 text-amber border-amber/20">
                          {top.score.toFixed(1)}
                        </Badge>
                      </div>
                      <Progress value={top.safetyRating * 10} className="h-2" />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-amber text-void hover:bg-amber-light"
                          onClick={() => {
                            setSelectedIntercept(top.id);
                            navigate("/intercepts");
                          }}
                        >
                          View intercepts
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedIntercept(top.id);
                            navigate(`/menu?interceptsId=${top.id}&server=food`);
                          }}
                        >
                          Order food
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="glass border-border-subtle">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="size-5 text-sky" />
                Your orders
              </CardTitle>
              <CardDescription>Live Swiggy orders synced to your journey</CardDescription>
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "past")}>
              <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab}>
            <TabsContent value={tab} className="mt-0">
              {displayOrders.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {tab === "active"
                    ? "No active orders. Plan a route and place an order at an intercept."
                    : "No past orders yet."}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayOrders.slice(0, 6).map((o) => (
                    <Link
                      key={o.id}
                      to={`/track/${o.id}`}
                      className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-raised/40 p-4 transition-colors hover:bg-surface-raised/70"
                    >
                      <div className="flex size-10 items-center justify-center rounded-xl bg-amber/10">
                        <Package className="size-5 text-amber" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {o.server === "food" ? "Food" : "Instamart"} · #{o.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {o.status.replace(/_/g, " ")} · {o.timingType}
                        </div>
                      </div>
                      <Badge variant="outline">{o.status.replace(/_/g, " ")}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
