import { JOURNEY_CONSTRAINTS } from "@routebite/shared/constants";
import { MapIsochroneLayer } from "~/components/ui/map";
import { circlePolygon, formatDistanceKm } from "~/lib/journey-distance";
import type { LatLng } from "~/lib/polyline";

type MapMinDistanceZoneProps = {
  center: LatLng;
  radiusM?: number;
  id?: string;
  /** Visual role — origin exclusion vs destination exclusion */
  role?: "origin" | "destination";
};

/**
 * Grey disc showing the minimum journey radius around a selected stop.
 * Predictions inside this radius are disabled in Places autocomplete.
 */
export function MapMinDistanceZone({
  center,
  radiusM = JOURNEY_CONSTRAINTS.MIN_DISTANCE_M,
  id = "min-distance",
  role = "origin",
}: MapMinDistanceZoneProps) {
  const geometry = circlePolygon(center, radiusM);
  const fill = role === "origin" ? "#71717a" : "#57534e";
  const line = role === "origin" ? "#a1a1aa" : "#a8a29e";

  return (
    <MapIsochroneLayer
      id={id}
      geometry={geometry}
      fillColor={fill}
      fillOpacity={0.18}
      lineColor={line}
      lineWidth={1.5}
      lineOpacity={0.65}
    />
  );
}

export function minDistanceZoneLabel(radiusM = JOURNEY_CONSTRAINTS.MIN_DISTANCE_M): string {
  return `${formatDistanceKm(radiusM)} exclusion`;
}
