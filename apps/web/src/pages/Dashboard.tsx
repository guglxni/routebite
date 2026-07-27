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
} from "lucide-react";
import { compareInterceptRank, selectTopK } from "@routebite/shared/algorithms";
import CountUp from "~/components/CountUp";
import SpotlightCard from "~/components/SpotlightCard";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { QuickRouteForm } from "~/components/journey/QuickRouteForm";
import { useAuth } from "~/stores/auth";
import { useOrders } from "~/stores/orders";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import { WeatherAlertsBanner } from "~/components/journey/WeatherAlertsBanner";
import { RouteOptimizePanel } from "~/components/journey/RouteOptimizePanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, hydrated } = useAuth();
  const { all, fetchOrders } = useOrders();
  const {
    current,
    intercepts,
    loading,
    setSelectedIntercept,
    customerPosition,
    selectedInterceptId,
  } = useJourney();

  const [tab, setTab] = useState<"active" | "past">("active");
  const [draftOrigin, setDraftOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [draftDestination, setDraftDestination] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  useEffect(() => {
    if (hydrated) fetchOrders();
  }, [hydrated, fetchOrders]);

  const topInterceptId = useMemo(() => {
    if (!intercepts.length) return null;
    return selectTopK(intercepts, 1, compareInterceptRank)[0]?.id ?? null;
  }, [intercepts]);

  const mapSelectedId = selectedInterceptId ?? topInterceptId;

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

  const origin = current
    ? { lat: current.originLat, lng: current.originLng }
    : null;
  const destination = current
    ? { lat: current.destinationLat, lng: current.destinationLng }
    : null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <PageHeader
        eyebrow="Overview"
        title="Where to next?"
        description={
          user?.name
            ? `${user.name.split(" ")[0]}, plan a trip, pick intercepts along the route, and order without leaving the journey.`
            : "Plan journeys with live Google Maps routing, discover intercept stops, order from Swiggy, and track alignment — all in one place."
        }
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3 flex flex-col gap-4">
          {loading && !current ? (
            <Skeleton className="h-[420px] w-full rounded-xl" />
          ) : (
            <JourneyMap
              origin={origin}
              destination={destination}
              draftOrigin={draftOrigin}
              draftDestination={draftDestination}
              routePoints={current?.routePoints}
              intercepts={intercepts}
              customerPosition={customerPosition}
              selectedInterceptId={mapSelectedId}
              onSelectIntercept={(id) => {
                setSelectedIntercept(id);
                navigate(`/intercepts`);
              }}
              heightClassName="h-[420px] md:h-[480px]"
            />
          )}

          {current && (
            <div className="flex flex-col gap-3">
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
                {current.outdoorConditions?.severity === "alert" && (
                  <Badge variant="destructive" className="gap-1">
                    <CloudRain className="size-3" />
                    Outdoor alert
                  </Badge>
                )}
                {current.outdoorConditions?.severity === "watch" && (
                  <Badge variant="secondary" className="gap-1 border-amber/30 text-amber">
                    <CloudRain className="size-3" />
                    Outdoor watch
                  </Badge>
                )}
                {current.outdoorConditions?.severity === "good" && (
                  <Badge variant="outline" className="gap-1 border-emerald/30 text-emerald">
                    Conditions clear
                  </Badge>
                )}
              </div>
              <WeatherAlertsBanner
                warnings={current.weatherWarnings}
                outdoorConditions={current.outdoorConditions}
              />
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
              <QuickRouteForm
                datalistId="rb-dashboard-places"
                onDraftPlacesChange={({ origin: o, destination: d }) => {
                  setDraftOrigin(o ? { lat: o.lat, lng: o.lng } : null);
                  setDraftDestination(d ? { lat: d.lat, lng: d.lng } : null);
                }}
              />
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
            <RouteOptimizePanel journey={current} intercepts={intercepts} />
          )}

          {current && intercepts.length > 0 && (
            <Card className="glass border-border-subtle">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top intercept</CardTitle>
                <CardDescription>Highest-scored stop on your route</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(() => {
                  const top = selectTopK(intercepts, 1, compareInterceptRank)[0]!;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{top.type} stop</span>
                        <Badge className="bg-amber/15 text-amber border-amber/20">
                          {top.score.toFixed(1)}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted">
                        <span className="text-violet-300 font-medium">
                          {top.reachableRestaurantCount ?? top.restaurantCount} rider-reachable
                        </span>
                        {" · "}
                        {top.restaurantCount} nearby · safety {top.safetyRating}/10
                      </p>
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
