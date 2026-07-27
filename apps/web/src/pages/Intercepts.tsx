import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Star,
  Clock,
  ChefHat,
  ArrowRight,
  UtensilsCrossed,
  ShoppingBag,
  Loader2,
  Bike,
} from "lucide-react";
import type { ServerType } from "@routebite/shared/types";
import { compareInterceptRank, selectTopK } from "@routebite/shared/algorithms";
import AnimatedContent from "~/components/AnimatedContent";
import SpotlightCard from "~/components/SpotlightCard";
import StarBorder from "~/components/StarBorder";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import {
  OutdoorRiskChip,
  WeatherAlertsBanner,
} from "~/components/journey/WeatherAlertsBanner";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CoverageBadges, HaltGateAlert } from "~/components/fusion/FusionPanels";
import { getHaltGate, getInterceptCoverage, getJourneyCorridor, type CorridorCoverage } from "~/lib/api";
import { toast } from "sonner";
import { ScrollArea } from "~/components/ui/scroll-area";

export default function Intercepts() {
  const navigate = useNavigate();
  const { current, intercepts, loadIntercepts, loading, error, selectedInterceptId, setSelectedIntercept } =
    useJourney();
  const [serverPreference, setServerPreference] = useState<ServerType>("food");
  const [coverage, setCoverage] = useState<CorridorCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [haltGate, setHaltGate] = useState<Awaited<ReturnType<typeof getHaltGate>> | null>(null);
  const [corridor, setCorridor] = useState<Awaited<ReturnType<typeof getJourneyCorridor>> | null>(
    null
  );
  const [corridorLoading, setCorridorLoading] = useState(false);

  useEffect(() => {
    if (current && intercepts.length === 0) loadIntercepts();
  }, [current, intercepts.length, loadIntercepts]);

  useEffect(() => {
    if (!selectedInterceptId && intercepts.length > 0) {
      const top = selectTopK(intercepts, 1, compareInterceptRank)[0];
      if (top) setSelectedIntercept(top.id);
    }
  }, [intercepts, selectedInterceptId, setSelectedIntercept]);

  const probeCoverage = async (id: string) => {
    setCoverageLoading(true);
    try {
      const [c, g] = await Promise.all([
        getInterceptCoverage(id),
        getHaltGate(id).catch(() => null),
      ]);
      setCoverage(c);
      setHaltGate(g);
    } catch (err) {
      toast.error("Coverage probe failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCoverageLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedInterceptId) return;
    setCoverage(null);
    setHaltGate(null);
    void probeCoverage(selectedInterceptId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInterceptId]);

  useEffect(() => {
    if (!current?.id) return;
    setCorridorLoading(true);
    void getJourneyCorridor(current.id, 5)
      .then(setCorridor)
      .catch(() => setCorridor(null))
      .finally(() => setCorridorLoading(false));
  }, [current?.id]);

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <Card className="glass max-w-md border-border-subtle p-8 text-center">
          <MapPin className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="text-xl font-bold mb-2">No route yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Plan a journey first to see intercepts on the map.</p>
          <Button className="bg-amber text-void hover:bg-amber-light" onClick={() => navigate("/routes/new")}>
            Plan route
          </Button>
        </Card>
      </div>
    );
  }

  if (loading && intercepts.length === 0) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-amber" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <Card className="glass mx-auto max-w-md border-rose/30 p-8 text-rose">
          <p className="text-sm">{error}</p>
          <Button className="mt-4" variant="outline" onClick={loadIntercepts}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const sorted = selectTopK(intercepts, intercepts.length, compareInterceptRank);
  const selectedId = selectedInterceptId ?? sorted[0]?.id ?? null;

  const handleOrder = () => {
    if (!selectedId) return;
    navigate(`/menu?interceptsId=${selectedId}&server=${serverPreference}`);
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-24">
      <PageHeader
        eyebrow="Stops"
        title="Where to meet"
        description={
          <>
            <span className="block text-text-secondary">
              {current.originAddress} → {current.destinationAddress}
            </span>
            <span className="mt-1 block text-xs text-text-muted">
              Ranked by dwell, density, and rider reachability on the two-wheeler network.
            </span>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadIntercepts} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh ETAs"}
            </Button>
            <Tabs value={serverPreference} onValueChange={(v) => setServerPreference(v as ServerType)}>
              <TabsList>
                <TabsTrigger value="food" className="gap-1.5">
                  <UtensilsCrossed className="size-3.5" />
                  Food
                </TabsTrigger>
                <TabsTrigger value="instamart" className="gap-1.5">
                  <ShoppingBag className="size-3.5" />
                  Instamart
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
      />

      {(current.outdoorConditions || (current.weatherWarnings?.length ?? 0) > 0) && (
        <WeatherAlertsBanner
          warnings={current.weatherWarnings}
          outdoorConditions={current.outdoorConditions}
        />
      )}

      {(corridor || corridorLoading) && (
        <Card className="glass border-border-subtle p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold">Corridor routing</p>
              <p className="text-xs text-muted-foreground">
                Swiggy Food + Instamart coverage along top intercepts
              </p>
            </div>
            {corridorLoading && <Loader2 className="size-4 animate-spin text-amber" />}
          </div>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 pb-2">
              {(corridor?.stops ?? []).map((s) => (
                <button
                  key={s.interceptId}
                  type="button"
                  onClick={() => setSelectedIntercept(s.interceptId)}
                  className={`min-w-[200px] rounded-xl border px-3 py-2 text-left transition-colors ${
                    selectedId === s.interceptId
                      ? "border-amber/40 bg-amber/10"
                      : "border-border-subtle hover:border-border-medium"
                  }`}
                >
                  <div className="truncate text-xs font-bold">
                    {s.name ?? s.type}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      Food {s.coverage?.food.tier ?? "—"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      IM {s.coverage?.instamart.tier ?? "—"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                    {s.mealHint?.hint ?? s.error ?? ""}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <JourneyMap
            origin={{ lat: current.originLat, lng: current.originLng }}
            destination={{ lat: current.destinationLat, lng: current.destinationLng }}
            routePoints={current.routePoints}
            intercepts={sorted}
            selectedInterceptId={selectedId}
            onSelectIntercept={setSelectedIntercept}
            heightClassName="h-[420px] md:h-[520px]"
          />
        </div>

        <div className="xl:col-span-2 flex flex-col gap-3">
          {selectedId && (
            <div className="flex flex-col gap-3">
              <CoverageBadges
                coverage={coverage}
                loading={coverageLoading}
                onProbe={() => void probeCoverage(selectedId)}
              />
              <HaltGateAlert gate={haltGate} />
            </div>
          )}
          {sorted.map((point, index) => {
            const isSelected = selectedId === point.id;
            const reachable =
              point.reachableRestaurantCount ??
              point.reachability?.reachableRestaurantCount ??
              point.restaurantCount;
            const riderMin = point.reachability?.isochroneOk
              ? Math.round((point.reachability.riderBudgetSeconds ?? 0) / 60)
              : null;
            return (
              <AnimatedContent key={point.id} distance={40} delay={index * 0.05}>
                <div
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer outline-none"
                  onClick={() => setSelectedIntercept(point.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedIntercept(point.id);
                  }}
                >
                <SpotlightCard
                  className={`rounded-xl border transition-all ${
                    isSelected
                      ? "border-amber/40 bg-surface-raised/80 shadow-glow"
                      : "border-border-subtle hover:border-border-medium"
                  }`}
                  spotlightColor={
                    isSelected
                      ? ("rgba(245, 158, 11, 0.12)" as `rgba(${number}, ${number}, ${number}, ${number})`)
                      : ("rgba(255, 255, 255, 0.04)" as `rgba(${number}, ${number}, ${number}, ${number})`)
                  }
                >
                  <div className="flex gap-4 p-4">
                  <div
                    className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                      isSelected ? "bg-amber/15" : "bg-surface-elevated"
                    }`}
                  >
                    <MapPin className={`size-5 ${isSelected ? "text-amber" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-bold">
                        {point.name ?? `${point.type} stop`}
                      </h3>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <OutdoorRiskChip
                          warnings={current.weatherWarnings}
                          point={{ lat: point.lat, lng: point.lng }}
                        />
                        <Badge variant="secondary" className="gap-1">
                          <Star className="size-3 fill-amber text-amber" />
                          {point.score.toFixed(1)}
                        </Badge>
                      </div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {Math.round(point.dwellTime / 60)} min halt
                      </span>
                      {point.etaSeconds != null && (
                        <span className="inline-flex items-center gap-1 text-sky">
                          ETA {Math.floor(point.etaSeconds / 60)}m
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-violet-300">
                        <Bike className="size-3" />
                        {reachable} reachable
                      </span>
                      <span className="inline-flex items-center gap-1 text-text-muted">
                        <ChefHat className="size-3" />
                        {point.restaurantCount} nearby
                      </span>
                      {riderMin != null && riderMin > 0 && (
                        <Badge
                          variant="outline"
                          className="border-violet/30 bg-violet/10 text-[10px] text-violet-300"
                        >
                          ~{riderMin} min rider zone
                        </Badge>
                      )}
                    </div>
                    <Progress value={point.safetyRating * 10} className="h-1.5" />
                  </div>
                </div>
                </SpotlightCard>
                </div>
              </AnimatedContent>
            );
          })}
        </div>
      </div>

      {selectedId && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <StarBorder
            as="button"
            type="button"
            color="#f59e0b"
            onClick={handleOrder}
          >
            <span className="flex items-center gap-2 px-6 py-2 text-sm font-semibold">
              Order at selected point
              <ArrowRight className="size-4" />
            </span>
          </StarBorder>
        </div>
      )}
    </div>
  );
}
