import { useMemo, useState } from "react";
import { Loader2, Route, Sparkles } from "lucide-react";
import { compareInterceptRank, selectTopK } from "@routebite/shared/algorithms";
import { toast } from "sonner";
import {
  optimizeRoute,
  type OptimizedRouteResult,
  type OptimizeWaypoint,
} from "~/lib/api";
import type { Intercept, Journey } from "~/stores/journey";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

type RouteOptimizePanelProps = {
  journey: Journey | null;
  intercepts: Intercept[];
  className?: string;
};

/**
 * Wires POST /api/v1/routes/optimize — reorders top intercept pickups
 * between origin and destination via Routes optimizeWaypointOrder.
 */
export function RouteOptimizePanel({ journey, intercepts, className }: RouteOptimizePanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizedRouteResult | null>(null);

  const topStops = useMemo(
    () => selectTopK(intercepts, Math.min(5, intercepts.length), compareInterceptRank),
    [intercepts],
  );

  if (!journey || topStops.length === 0) return null;

  const runOptimize = async () => {
    setLoading(true);
    try {
      const waypoints: OptimizeWaypoint[] = [
        {
          lat: journey.originLat,
          lng: journey.originLng,
          name: journey.originAddress,
          type: "origin",
        },
        ...topStops.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          name: p.name ?? `${p.type} stop`,
          type: "pickup" as const,
          dwellMinutes: Math.max(1, Math.round(p.dwellTime / 60)),
        })),
        {
          lat: journey.destinationLat,
          lng: journey.destinationLng,
          name: journey.destinationAddress,
          type: "destination",
        },
      ];

      const data = await optimizeRoute({
        waypoints,
        transportMode: journey.transportMode,
      });
      setResult(data);
      toast.success("Stop order optimized", {
        description: `Solver: ${data.solver.replace(/_/g, " ")} · ${(
          data.totalDistanceMeters / 1000
        ).toFixed(1)} km`,
      });
    } catch (err) {
      toast.error("Optimize failed", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const orderedLabels = result
    ? result.optimizedOrder.map((idx) => {
        if (idx === 0) return "Origin";
        if (idx === topStops.length + 1) return "Destination";
        const stop = topStops[idx - 1];
        return stop?.name ?? stop?.type ?? `Stop ${idx}`;
      })
    : [];

  return (
    <Card className={`glass border-border-subtle ${className ?? ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-amber" />
          Optimize stop order
        </CardTitle>
        <CardDescription>
          Uses Google Routes <code className="text-amber">optimizeWaypointOrder</code> on your top
          intercepts. Falls back to a local matrix/TSP solver if Routes is unavailable or
          rate-limited.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          {topStops.length} pickup stop{topStops.length === 1 ? "" : "s"} between origin and
          destination.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-amber/30 text-amber hover:bg-amber/10"
          disabled={loading}
          onClick={() => void runOptimize()}
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
              Optimizing…
            </>
          ) : (
            <>
              <Route className="size-3.5" data-icon="inline-start" />
              Run optimization
            </>
          )}
        </Button>

        {result && (
          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-void/40 p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald/30 text-emerald">
                {(result.totalDistanceMeters / 1000).toFixed(1)} km
              </Badge>
              <Badge variant="outline" className="border-sky/30 text-sky">
                {Math.round(result.totalDurationSeconds / 60)} min
              </Badge>
              <Badge variant="secondary">{result.solver.replace(/_/g, " ")}</Badge>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-text-secondary">
              {orderedLabels.map((label, i) => (
                <li key={`${label}-${i}`}>{label}</li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
