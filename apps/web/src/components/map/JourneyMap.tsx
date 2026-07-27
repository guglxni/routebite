import { useEffect, useMemo, useRef } from "react";
import {
  Map,
  MapArc,
  MapClusterLayer,
  MapControls,
  MapIsochroneLayer,
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
import type { Intercept, InterceptReachability } from "~/stores/journey";
import { MapMinDistanceZone } from "~/components/map/MapMinDistanceZone";
import { MapOverlayLegend } from "~/components/map/MapOverlayLegend";
import { JOURNEY_CONSTRAINTS } from "@routebite/shared/constants";

type JourneyMapProps = {
  origin?: LatLng | null;
  destination?: LatLng | null;
  routePoints?: LatLng[];
  intercepts?: Intercept[];
  selectedInterceptId?: string | null;
  riderPosition?: LatLng | null;
  customerPosition?: LatLng | null;
  /** Override reachability polygons (e.g. from restaurants API). */
  reachability?: InterceptReachability | null;
  /**
   * Draft pins while composing a Quick route (before analyze succeeds).
   * Used to preview the 5 km exclusion disc around each selected stop.
   */
  draftOrigin?: LatLng | null;
  draftDestination?: LatLng | null;
  /** Show grey min-distance discs around draft/confirmed ends. Default: when drafts exist. */
  showMinDistanceZones?: boolean;
  /** Extra pins (e.g. admin fleet riders). */
  fleetMarkers?: Array<{ id: string; lat: number; lng: number; label?: string; tone?: "online" | "busy" | "offline" }>;
  /**
   * Override which points drive fitBounds.
   * - undefined: fit all displayed points (default)
   * - [] / omit empty: skip auto-fit (keep center/zoom)
   * - LatLng[]: fit only these
   */
  fitPoints?: LatLng[] | null;
  /** Initial zoom when not fitting a wide bounds set. */
  zoom?: number;
  className?: string;
  heightClassName?: string;
  onSelectIntercept?: (id: string) => void;
  interactive?: boolean;
  showArcs?: boolean;
  showTrafficOverlay?: boolean;
  showIsochrones?: boolean;
  showLegend?: boolean;
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
  customerPosition,
  reachability: reachabilityProp,
  draftOrigin = null,
  draftDestination = null,
  showMinDistanceZones,
  fleetMarkers = [],
  fitPoints,
  zoom = 11,
  className,
  heightClassName = "h-[420px]",
  onSelectIntercept,
  interactive = true,
  showArcs = true,
  showTrafficOverlay = true,
  showIsochrones = true,
  showLegend = true,
}: JourneyMapProps) {
  const displayOrigin = origin ?? draftOrigin;
  const displayDestination = destination ?? draftDestination;
  const showZones =
    showMinDistanceZones ?? Boolean(draftOrigin || draftDestination);

  const allPoints = useMemo(() => {
    const pts: LatLng[] = [];
    if (displayOrigin) pts.push(displayOrigin);
    if (displayDestination) pts.push(displayDestination);
    if (routePoints.length) pts.push(...routePoints);
    else intercepts.forEach((i) => pts.push({ lat: i.lat, lng: i.lng }));
    if (riderPosition) pts.push(riderPosition);
    if (customerPosition) pts.push(customerPosition);
    fleetMarkers.forEach((m) => pts.push({ lat: m.lat, lng: m.lng }));
    return pts;
  }, [
    displayOrigin,
    displayDestination,
    routePoints,
    intercepts,
    riderPosition,
    customerPosition,
    fleetMarkers,
  ]);

  const boundsPoints = fitPoints === null ? [] : (fitPoints ?? allPoints);

  const center = useMemo<[number, number]>(() => {
    if (riderPosition) return [riderPosition.lng, riderPosition.lat];
    if (displayOrigin) return [displayOrigin.lng, displayOrigin.lat];
    if (allPoints[0]) return [allPoints[0].lng, allPoints[0].lat];
    return [77.5946, 12.9716];
  }, [riderPosition, displayOrigin, allPoints]);

  const routeCoords = useMemo(
    () => (routePoints.length >= 2 ? toMapCoordinates(routePoints) : []),
    [routePoints],
  );

  const fallbackRoute = useMemo<[number, number][]>(() => {
    if (routeCoords.length >= 2 || !displayOrigin || !displayDestination) return [];
    return [
      [displayOrigin.lng, displayOrigin.lat],
      [displayDestination.lng, displayDestination.lat],
    ];
  }, [routeCoords, displayOrigin, displayDestination]);

  const lineCoords = routeCoords.length >= 2 ? routeCoords : fallbackRoute;

  const arcs = useMemo(() => {
    if (!showArcs || !displayOrigin) return [];
    return intercepts.map((p) => ({
      id: p.id,
      from: [displayOrigin.lng, displayOrigin.lat] as [number, number],
      to: [p.lng, p.lat] as [number, number],
    }));
  }, [showArcs, displayOrigin, intercepts]);

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

  const selected = useMemo(
    () => intercepts.find((i) => i.id === selectedInterceptId),
    [intercepts, selectedInterceptId],
  );

  const reachability = reachabilityProp ?? selected?.reachability ?? null;
  const riderIso = showIsochrones
    ? (reachability?.riderIsochrone as GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined)
    : undefined;
  const walkIso = showIsochrones
    ? (reachability?.walkIsochrone as GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined)
    : undefined;

  return (
    <Card className={cn("overflow-hidden border-border-subtle p-0", className)}>
      <div className={cn("relative w-full", heightClassName)}>
        <Map center={center} zoom={zoom} theme="dark" className="absolute inset-0">
          {boundsPoints.length > 0 && <FitBounds points={boundsPoints} />}
          <MapControls showZoom showCompass showFullscreen showLocate position="top-right" />

          {riderIso && (
            <MapIsochroneLayer
              id="rider-reach"
              geometry={riderIso}
              fillColor="#a78bfa"
              fillOpacity={0.16}
              lineColor="#a78bfa"
              lineWidth={2}
              lineOpacity={0.8}
            />
          )}
          {walkIso && (
            <MapIsochroneLayer
              id="walk-reach"
              geometry={walkIso}
              fillColor="#34d399"
              fillOpacity={0.2}
              lineColor="#34d399"
              lineWidth={1.5}
              lineOpacity={0.85}
            />
          )}

          {showZones && draftOrigin && (
            <MapMinDistanceZone
              id="draft-origin-min"
              center={draftOrigin}
              radiusM={JOURNEY_CONSTRAINTS.MIN_DISTANCE_M}
              role="origin"
            />
          )}
          {showZones && draftDestination && (
            <MapMinDistanceZone
              id="draft-dest-min"
              center={draftDestination}
              radiusM={JOURNEY_CONSTRAINTS.MIN_DISTANCE_M}
              role="destination"
            />
          )}

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

          {displayOrigin && (
            <MapMarker longitude={displayOrigin.lng} latitude={displayOrigin.lat}>
              <MarkerContent>
                <div className="size-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg shadow-emerald-500/30" />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-emerald-400">
                {origin ? "Origin" : "Origin (draft)"}
              </MarkerLabel>
            </MapMarker>
          )}

          {displayDestination && (
            <MapMarker longitude={displayDestination.lng} latitude={displayDestination.lat}>
              <MarkerContent>
                <div className="size-4 rounded-full border-2 border-white bg-sky-500 shadow-lg shadow-sky-500/30" />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-sky-400">
                {destination ? "Destination" : "Destination (draft)"}
              </MarkerLabel>
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

          {fleetMarkers.map((m) => (
            <MapMarker key={m.id} longitude={m.lng} latitude={m.lat}>
              <MarkerContent>
                <div
                  className={cn(
                    "size-4 rounded-full border-2 border-white shadow-lg",
                    m.tone === "busy" && "bg-amber-500 shadow-amber-500/40",
                    m.tone === "online" && "bg-emerald-500 shadow-emerald-500/40",
                    (!m.tone || m.tone === "offline") && "bg-zinc-500 shadow-zinc-500/30",
                  )}
                />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-zinc-300">
                {m.label ?? "Rider"}
              </MarkerLabel>
              <MarkerTooltip>{m.label ?? "Fleet rider"}</MarkerTooltip>
            </MapMarker>
          ))}

          {customerPosition && (
            <MapMarker longitude={customerPosition.lng} latitude={customerPosition.lat}>
              <MarkerContent>
                <div className="size-5 rounded-full border-2 border-white bg-emerald-400 shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-400/30" />
              </MarkerContent>
              <MarkerLabel className="font-semibold text-emerald-400">You</MarkerLabel>
              <MarkerTooltip>Your live location</MarkerTooltip>
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
                    {point.name ?? point.type} · {point.dwellTime}s dwell ·{" "}
                    {point.reachableRestaurantCount ?? point.restaurantCount} reachable
                  </MarkerTooltip>
                  {selected && (
                    <MarkerPopup closeButton>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold">{point.type} intercept</span>
                        <span className="text-xs text-muted-foreground">
                          {point.dwellTime}s dwell · {point.restaurantCount} nearby ·{" "}
                          {point.reachableRestaurantCount ?? "—"} rider-reachable
                        </span>
                        {point.reachability?.isochroneOk && (
                          <span className="text-xs text-violet-300">
                            Rider zone ~{Math.round((point.reachability.riderBudgetSeconds ?? 0) / 60)}{" "}
                            min bike
                          </span>
                        )}
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

        {showLegend && (
          <MapOverlayLegend
            showIsochrones={showIsochrones && Boolean(riderIso || walkIso)}
            showRoute={lineCoords.length >= 2}
            showTraffic={showTrafficOverlay && lineCoords.length >= 2}
            showYou={Boolean(customerPosition)}
            showRider={Boolean(riderPosition) || fleetMarkers.length > 0}
            showMinDistance={showZones && Boolean(draftOrigin || draftDestination)}
            compact
          />
        )}

        {showIsochrones && selected && reachability && !reachability.isochroneOk && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[200px] rounded-lg border border-border-subtle bg-void/85 px-2.5 py-2 text-[10px] text-text-muted backdrop-blur-md">
            Reachability polygons unavailable for this stop — using circular density.
          </div>
        )}
      </div>
    </Card>
  );
}
