export type GeoPoint = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371e3;

/** Great-circle distance in meters — O(1). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Quantize coordinates to a grid cell key — O(1). */
export function toGridKey(lat: number, lng: number, precision = 3): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

/** Approximate degrees latitude for a ground distance in meters. */
export function metersToLatitudeDegrees(meters: number): number {
  return meters / 111_320;
}
