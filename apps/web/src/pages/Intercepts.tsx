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
} from "lucide-react";
import type { ServerType } from "@routebite/shared/types";
import AnimatedContent from "~/components/AnimatedContent";
import SpotlightCard from "~/components/SpotlightCard";
import StarBorder from "~/components/StarBorder";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

export default function Intercepts() {
  const navigate = useNavigate();
  const { current, intercepts, loadIntercepts, loading, error, selectedInterceptId, setSelectedIntercept } =
    useJourney();
  const [serverPreference, setServerPreference] = useState<ServerType>("food");

  useEffect(() => {
    if (current && intercepts.length === 0) loadIntercepts();
  }, [current, intercepts.length, loadIntercepts]);

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

  const sorted = [...intercepts].sort((a, b) => b.score - a.score);
  const selectedId = selectedInterceptId ?? sorted[0]?.id ?? null;

  const handleOrder = () => {
    if (!selectedId) return;
    navigate(`/menu?interceptsId=${selectedId}&server=${serverPreference}`);
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-24">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Intercept points</h1>
          <p className="text-sm text-text-secondary">
            {current.originAddress} → {current.destinationAddress}
          </p>
        </div>
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
      </div>

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
          {sorted.map((point, index) => {
            const isSelected = selectedId === point.id;
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
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Star className="size-3 fill-amber text-amber" />
                        {point.score.toFixed(1)}
                      </Badge>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {point.dwellTime} min
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ChefHat className="size-3" />
                        {point.restaurantCount} spots
                      </span>
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
