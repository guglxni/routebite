import { useEffect, useMemo, useRef } from "react";
import {
  Map,
  MapArc,
  MapClusterLayer,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MarkerPopup,
  MarkerTooltip,
  MapRoute,
  useMap,
} from "~/components/ui/map";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { boundsFromPoints, toMapCoordinates, type LatLng } from "~/lib/polyline";
import type { Intercept } from "~/stores/journey";

type JourneyMapProps = {
  origin?: LatLng | null;
  destination?: LatLng | null;
  routePoints?: LatLng[];
  intercepts?: Intercept[];
  selectedInterceptId?: string | null;
  riderPosition?: LatLng | null;
  className?: string;
  heightClassName?: string;
  onSelectIntercept?: (id: string) => void;
  interactive?: boolean;
  showArcs?: boolean;
  showTrafficOverlay?: boolean;
};

function FitBounds({ points, padding = 48 }: { points: LatLng[]; padding?: number }) {
  const { map, isLoaded } = useMap();
  const fittedRef = useRef<string>("");

  useEffect(() => {
    if (!isLoaded || !map || points.length === 0) return;
    const key = points.map((p) => `${p.lat},${p.lng}`).join("|");
    if (fittedRef.current === key) return;
    fittedRef.current = key;

    const bounds = boundsFromPoints(points);
    if (!bounds) return;
    map.fitBounds(bounds, { padding, duration: 800 });
  }, [isLoaded, map, points, padding]);

  return null;
}

export function JourneyMap({
  origin,
  destination,
  routePoints = [],
  intercepts = [],
  selectedInterceptId,
  riderPosition,
  className,
  heightClassName = "h-[420px]",
  onSelectIntercept,
  interactive = true,
  showArcs = true,
  showTrafficOverlay = true,
}: JourneyMapProps) {
  const allPoints = useMemo(() => {
    const pts: LatLng[] = [];
    if (origin) pts.push(origin);
    if (destination) pts.push(destination);
    if (routePoints.length) pts.push(...routePoints);
    else intercepts.forEach((i) => pts.push({ lat: i.lat, lng: i.lng }));
    if (riderPosition) pts.push(riderPosition);
    return pts;
  }, [origin, destination, routePoints, intercepts, riderPosition]);

  const center = useMemo<[number, number]>(() => {
    if (origin) return [origin.lng, origin.lat];
    if (allPoints[0]) return [allPoints[0].lng, allPoints[0].lat];
    return [77.5946, 12.9716];
  }, [origin, allPoints]);

  const routeCoords = useMemo(
    () => (routePoints.length >= 2 ? toMapCoordinates(routePoints) : []),
    [routePoints],
  );

  const fallbackRoute = useMemo<[number, number][]>(() => {
    if (routeCoords.length >= 2 || !origin || !destination) return [];
    return [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ];
  }, [routeCoords, origin, destination]);

  const lineCoords = routeCoords.length >= 2 ? routeCoords : fallbackRoute;

  const arcs = useMemo(() => {
    if (!showArcs || !origin) return [];
    return intercepts.map((p) => ({
      id: p.id,
      from: [origin.lng, origin.lat] as [number, number],
      to: [p.lng, p.lat] as [number, number],
    }));
  }, [showArcs, origin, intercepts]);

  const clusterData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    if (intercepts.length < 6) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: intercepts.map((p) => ({
        type: "Feature",
        properties: { id: p.id, score: p.score },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    };
  }, [intercepts]);

  const useCluster = intercepts.length >= 6;

  return (
    <Card className={cn("overflow-hidden border-border-subtle p-0", className)}>
      <div className={cn("relative w-full", heightClassName)}>
        <Map center={center} zoom={11} theme="dark" className="absolute inset-0">
          <FitBounds points={allPoints} />
          <MapControls showZoom showCompass showFullscreen showLocate position="top-right" />

          {lineCoords.length >= 2 && (
            <>
              <MapRoute
                coordinates={lineCoords}
                color="#f59e0b"
                width={4}
                opacity={0.88}
                interactive={false}
              />
              {showTrafficOverlay && (
                <MapRoute
                  coordinates={lineCoords}
                  color="#38bdf8"
                  width={2}
                  opacity={0.3}
                  dashArray={[1.5, 1.5]}
                  interactive={false}
                />
              )}
            </>
          )}

          {arcs.length > 0 && (
            <MapArc
              data={arcs}
              curvature={0.12}
              paint={{
                "line-color": "#a78bfa",
                "line-width": 1.5,
                "line-opacity": 0.5,
              }}
              hoverPaint={{ "line-opacity": 0.85, "line-width": 2.5 }}
              interactive={interactive}
              onClick={(e) => interactive && onSelectIntercept?.(String(e.arc.id))}
            />
          )}

          {useCluster && (
            <MapClusterLayer
              data={clusterData}
              clusterColors={["#f59e0b", "#fbbf24", "#d97706"]}
              pointColor="#f59e0b"
              onPointClick={(feature) => {
                const id = feature.properties?.id;
                if (typeof id === "string") onSelectIntercept?.(id);
              }}
            />
          )}

          {origin && (
            <MapMarker longitude={origin.lng} latitude={origin.lat}>
              <MarkerContent>
                <div className="size-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg shadow-emerald-500/30" />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-emerald-400">Origin</MarkerLabel>
            </MapMarker>
          )}

          {destination && (
            <MapMarker longitude={destination.lng} latitude={destination.lat}>
              <MarkerContent>
                <div className="size-4 rounded-full border-2 border-white bg-sky-500 shadow-lg shadow-sky-500/30" />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-sky-400">Destination</MarkerLabel>
            </MapMarker>
          )}

          {riderPosition && (
            <MapMarker longitude={riderPosition.lng} latitude={riderPosition.lat}>
              <MarkerContent>
                <div className="size-5 animate-pulse rounded-full border-2 border-white bg-violet-500 shadow-lg shadow-violet-500/40" />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-violet-400">Rider</MarkerLabel>
              <MarkerTooltip>Rider en route</MarkerTooltip>
            </MapMarker>
          )}

          {!useCluster &&
            intercepts.map((point) => {
              const selected = selectedInterceptId === point.id;
              return (
                <MapMarker
                  key={point.id}
                  longitude={point.lng}
                  latitude={point.lat}
                  onClick={() => interactive && onSelectIntercept?.(point.id)}
                >
                  <MarkerContent>
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg transition-transform",
                        selected
                          ? "scale-110 border-amber bg-amber text-void shadow-amber/30"
                          : "border-white bg-surface-elevated text-amber",
                      )}
                    >
                      {Math.round(point.score)}
                    </div>
                  </MarkerContent>
                  <MarkerTooltip className="bg-[#0c0c14] text-zinc-200">
                    {point.name ?? point.type} · {point.dwellTime}m · {point.restaurantCount} spots
                  </MarkerTooltip>
                  {selected && (
                    <MarkerPopup closeButton>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold">{point.type} intercept</span>
                        <span className="text-xs text-muted-foreground">
                          {point.dwellTime} min dwell · {point.restaurantCount} restaurants
                        </span>
                        <Badge variant="secondary" className="w-fit">
                          Safety {point.safetyRating}/10
                        </Badge>
                      </div>
                    </MarkerPopup>
                  )}
                </MapMarker>
              );
            })}
        </Map>
      </div>
    </Card>
  );
}
