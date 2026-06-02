import type { LatLng } from '@routebite/shared/types';

/**
 * Haversine distance between two points in meters.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLambda = ((b.lng - a.lng) * Math.PI) / 180;

  const sinΔφ = Math.sin(Δφ / 2);
  const sindeltaLambda = Math.sin(deltaLambda / 2);

  const x = sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sindeltaLambda * sindeltaLambda;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * c;
}

/**
 * Project a point onto the route polyline and return:
 * - index: index of the closest segment
 * - distance: distance along route in meters
 */
export function projectOntoRoute(point: LatLng, route: LatLng[]): { index: number; distance: number } {
  let minDist = Infinity;
  let closestIndex = 0;
  let closestT = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const t = projectOnSegment(point, a, b);
    const proj = interpolate(a, b, t);
    const dist = haversineDistance(point, proj);

    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
      closestT = t;
    }
  }

  // Calculate distance along route to projection
  let distance = 0;
  for (let i = 0; i < closestIndex; i++) {
    distance += haversineDistance(route[i], route[i + 1]);
  }
  distance += haversineDistance(route[closestIndex], interpolate(route[closestIndex], route[closestIndex + 1], closestT));

  return { index: closestIndex, distance };
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const abLat = b.lat - a.lat;
  const abLng = b.lng - a.lng;
  const apLat = p.lat - a.lat;
  const apLng = p.lng - a.lng;

  const ab2 = abLat * abLat + abLng * abLng;
  if (ab2 === 0) return 0;

  const t = (apLat * abLat + apLng * abLng) / ab2;
  return Math.max(0, Math.min(1, t));
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

/**
 * Estimate average speed for a transport mode (m/s).
 */
export function estimateSpeed(mode: string): number {
  switch (mode) {
    case 'bus': return 8.33;   // ~30 km/h
    case 'train': return 16.67; // ~60 km/h
    case 'car': return 11.11;  // ~40 km/h
    case 'bike': return 5.56;  // ~20 km/h
    case 'metro': return 8.33; // ~30 km/h
    case 'walk': return 1.39;  // ~5 km/h
    default: return 8.33;
  }
}

/**
 * Calculate ETA from start to a point along the route.
 */
export function calculateETA(point: LatLng, route: LatLng[], mode: string): number {
  const { distance } = projectOntoRoute(point, route);
  const speed = estimateSpeed(mode);
  return distance / speed;
}

/**
 * Generate a deterministic UUID-ish ID from inputs.
 */
export function makeInterceptId(journeyId: string, lat: number, lng: number): string {
  const hash = `${journeyId}:${lat.toFixed(6)}:${lng.toFixed(6)}`;
  return `int_${Buffer.from(hash).toString('base64url').slice(0, 16)}`;
}
