import { JOURNEY_CONSTRAINTS } from "@routebite/shared/constants";
import { haversineMeters, type GeoPoint } from "@routebite/shared/algorithms";

export type PlaceCoords = GeoPoint & {
  address: string;
};

export type JourneyPairStatus =
  | { ok: true; distanceM: number }
  | {
      ok: false;
      reason: "too_short" | "too_long";
      distanceM: number;
      message: string;
    };

/** Straight-line (geodesic) pair check — client gate before Routes API. */
export function evaluateJourneyPair(
  a: GeoPoint,
  b: GeoPoint,
  constraints: { minM?: number; maxM?: number } = {},
): JourneyPairStatus {
  const minM = constraints.minM ?? JOURNEY_CONSTRAINTS.MIN_DISTANCE_M;
  const maxM = constraints.maxM ?? JOURNEY_CONSTRAINTS.MAX_DISTANCE_M;
  const distanceM = haversineMeters(a, b);

  if (distanceM < minM) {
    return {
      ok: false,
      reason: "too_short",
      distanceM,
      message: `Too close (~${formatDistanceKm(distanceM)}). Pick places at least ${formatDistanceKm(minM)} apart.`,
    };
  }
  if (distanceM > maxM) {
    return {
      ok: false,
      reason: "too_long",
      distanceM,
      message: `Too far (~${formatDistanceKm(distanceM)}). Journeys must be under ${formatDistanceKm(maxM)}.`,
    };
  }
  return { ok: true, distanceM };
}

/** Classify a prediction distance vs journey constraints (for greying suggestions). */
export function classifySuggestionDistance(
  distanceM: number | undefined | null,
  constraints: { minM?: number; maxM?: number } = {},
): "ok" | "too_short" | "too_long" | "unknown" {
  if (distanceM == null || !Number.isFinite(distanceM)) return "unknown";
  const minM = constraints.minM ?? JOURNEY_CONSTRAINTS.MIN_DISTANCE_M;
  const maxM = constraints.maxM ?? JOURNEY_CONSTRAINTS.MAX_DISTANCE_M;
  if (distanceM < minM) return "too_short";
  if (distanceM > maxM) return "too_long";
  return "ok";
}

export function formatDistanceKm(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Approximate circle as a GeoJSON polygon (lon/lat rings) for MapLibre overlays. */
export function circlePolygon(
  center: GeoPoint,
  radiusM: number,
  steps = 64,
): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const lat0 = (center.lat * Math.PI) / 180;
  const lng0 = (center.lng * Math.PI) / 180;
  const angular = radiusM / 6_371_000;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(lat0) * Math.cos(angular) +
        Math.cos(lat0) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng =
      lng0 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat0),
        Math.cos(angular) - Math.sin(lat0) * Math.sin(lat),
      );
    coords.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI]);
  }

  return { type: "Polygon", coordinates: [coords] };
}

export { JOURNEY_CONSTRAINTS };
