import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Car, Bus, Train, Bike, Loader2, RotateCcw } from "lucide-react";
import type { TransportMode } from "@routebite/shared/types";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";

const demoPlaces = [
  "Koramangala, Bengaluru",
  "Indiranagar, Bengaluru",
  "MG Road, Bengaluru",
  "Whitefield, Bengaluru",
  "Electronic City, Bengaluru",
  "Hebbal, Bengaluru",
];

const transportOptions: { value: TransportMode; icon: React.ElementType; label: string }[] = [
  { value: "car", icon: Car, label: "Car" },
  { value: "bus", icon: Bus, label: "Bus" },
  { value: "train", icon: Train, label: "Train" },
  { value: "bike", icon: Bike, label: "Bike" },
];

export default function RouteBuilder() {
  const navigate = useNavigate();
  const { current, intercepts, buildJourney, loading } = useJourney();
  const [from, setFrom] = useState("Koramangala, Bengaluru");
  const [to, setTo] = useState("Whitefield, Bengaluru");
  const [mode, setMode] = useState<TransportMode>("car");

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await buildJourney({
          originAddress: from.trim(),
          destinationAddress: to.trim(),
          transportMode: mode,
        });
        const count = useJourney.getState().intercepts.length;
        toast.success("Route ready", { description: `${count} intercept points found.` });
      } catch (err) {
        toast.error("Could not build route", { description: (err as Error).message });
      }
    },
    [from, to, mode, buildJourney],
  );

  const origin = current ? { lat: current.originLat, lng: current.originLng } : null;
  const destination = current ? { lat: current.destinationLat, lng: current.destinationLng } : null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold">Plan your journey</h1>
        <p className="text-sm text-text-secondary mt-1">
          Live Google Maps routing with traffic, toll detection, weather enrichment, and intercept scoring.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass border-border-subtle order-2 lg:order-1">
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
            <CardDescription>Addresses are validated and geocoded on the server.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="from">Origin</Label>
                <Input
                  id="from"
                  list="rb-route-places"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  required
                  className="bg-surface-raised border-border-subtle"
                />
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const t = from;
                    setFrom(to);
                    setTo(t);
                  }}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="to">Destination</Label>
                <Input
                  id="to"
                  list="rb-route-places"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  required
                  className="bg-surface-raised border-border-subtle"
                />
              </div>

              <datalist id="rb-route-places">
                {demoPlaces.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>

              <div className="grid grid-cols-4 gap-2">
                {transportOptions.map((t) => (
                  <Button
                    key={t.value}
                    type="button"
                    variant={mode === t.value ? "default" : "outline"}
                    className={`flex flex-col gap-1 h-auto py-3 ${mode === t.value ? "bg-amber text-void hover:bg-amber-light" : ""}`}
                    onClick={() => setMode(t.value)}
                  >
                    <t.icon className="size-4" />
                    <span className="text-xs">{t.label}</span>
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
                    <Loader2 className="size-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    Find intercepts
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>

              {current && intercepts.length > 0 && (
                <Button type="button" variant="secondary" onClick={() => navigate("/intercepts")}>
                  Continue to intercepts
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="order-1 lg:order-2">
          <JourneyMap
            origin={origin}
            destination={destination}
            routePoints={current?.routePoints}
            intercepts={intercepts}
            heightClassName="h-[360px] lg:h-full min-h-[360px]"
          />
        </div>
      </div>
    </div>
  );
}
