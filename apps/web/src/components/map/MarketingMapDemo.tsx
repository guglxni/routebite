import { useMemo } from "react";
import {
  Map,
  MapArc,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
} from "~/components/ui/map";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { Intercept } from "~/stores/journey";
import type { LatLng } from "~/lib/polyline";
import { boundsFromPoints, toMapCoordinates } from "~/lib/polyline";

/** Public demo route — Koramangala → Whitefield (approximate points). */
export const DEMO_ORIGIN: LatLng = { lat: 12.9352, lng: 77.6245 };
export const DEMO_DEST: LatLng = { lat: 12.9698, lng: 77.7499 };
export const DEMO_ROUTE: LatLng[] = [
  DEMO_ORIGIN,
  { lat: 12.938, lng: 77.64 },
  { lat: 12.945, lng: 77.66 },
  { lat: 12.952, lng: 77.68 },
  { lat: 12.958, lng: 77.705 },
  { lat: 12.962, lng: 77.725 },
  DEMO_DEST,
];
export const DEMO_INTERCEPTS: Intercept[] = [
  { id: "demo-1", lat: 12.945, lng: 77.66, type: "Toll", score: 92, dwellTime: 14, restaurantCount: 18, safetyRating: 4.2 },
  { id: "demo-2", lat: 12.952, lng: 77.68, type: "Service", score: 87, dwellTime: 11, restaurantCount: 24, safetyRating: 4.0 },
  { id: "demo-3", lat: 12.958, lng: 77.705, type: "Metro", score: 81, dwellTime: 9, restaurantCount: 15, safetyRating: 3.8 },
];

type MarketingMapDemoProps = {
  className?: string;
  heightClassName?: string;
};

export function MarketingMapDemo({
  className,
  heightClassName = "h-[420px] md:h-[480px]",
}: MarketingMapDemoProps) {
  const routeCoords = useMemo(() => toMapCoordinates(DEMO_ROUTE), []);
  const allPoints = useMemo(() => [...DEMO_ROUTE, ...DEMO_INTERCEPTS.map((i) => ({ lat: i.lat, lng: i.lng }))], []);

  const arcs = useMemo(
    () =>
      DEMO_INTERCEPTS.map((p) => ({
        id: p.id,
        from: [DEMO_ORIGIN.lng, DEMO_ORIGIN.lat] as [number, number],
        to: [p.lng, p.lat] as [number, number],
      })),
    [],
  );

  const bounds = boundsFromPoints(allPoints);
  const center: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : [77.67, 12.95];

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a10]", className)}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#07070c]/80 px-4 py-3 backdrop-blur-md">
        <div>
          <p className="text-sm font-semibold text-white">Live route preview</p>
          <p className="text-xs text-zinc-500">mapcn · MapLibre · CARTO dark</p>
        </div>
        <Badge className="border-amber/30 bg-amber/10 text-amber">Demo</Badge>
      </div>

      <div className={cn("relative w-full pt-12", heightClassName)}>
        <Map center={center} zoom={11} theme="dark" className="absolute inset-0 top-12">
          <MapControls showZoom showCompass showFullscreen showLocate position="top-right" />

          <MapRoute coordinates={routeCoords} color="#f59e0b" width={4} opacity={0.9} interactive={false} />
          <MapRoute
            coordinates={routeCoords}
            color="#38bdf8"
            width={2}
            opacity={0.35}
            dashArray={[2, 2]}
            interactive={false}
          />

          <MapArc
            data={arcs}
            curvature={0.15}
            paint={{
              "line-color": "#a78bfa",
              "line-width": 1.5,
              "line-opacity": 0.55,
            }}
            interactive={false}
          />

          <MapMarker longitude={DEMO_ORIGIN.lng} latitude={DEMO_ORIGIN.lat}>
            <MarkerContent>
              <div className="size-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg shadow-emerald-500/40" />
            </MarkerContent>
            <MarkerLabel className="font-semibold text-emerald-400">Start</MarkerLabel>
          </MapMarker>

          <MapMarker longitude={DEMO_DEST.lng} latitude={DEMO_DEST.lat}>
            <MarkerContent>
              <div className="size-4 rounded-full border-2 border-white bg-sky-500 shadow-lg shadow-sky-500/40" />
            </MarkerContent>
            <MarkerLabel className="font-semibold text-sky-400">End</MarkerLabel>
          </MapMarker>

          {DEMO_INTERCEPTS.map((point) => (
            <MapMarker key={point.id} longitude={point.lng} latitude={point.lat}>
              <MarkerContent>
                <div className="flex size-9 items-center justify-center rounded-full border-2 border-amber bg-[#0c0c14] text-[11px] font-bold text-amber shadow-lg shadow-amber/20">
                  {Math.round(point.score)}
                </div>
              </MarkerContent>
              <MarkerTooltip className="border-amber/20 bg-[#0c0c14] text-zinc-200">
                {point.type} · {point.dwellTime}m dwell · {point.restaurantCount} spots
              </MarkerTooltip>
            </MapMarker>
          ))}
        </Map>
      </div>
    </div>
  );
}
