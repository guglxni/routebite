import type { LatLng } from '@routebite/shared/types';
import { TtlLruCache } from '../../lib/ttl-lru-cache';
import { toGridKey } from '../../lib/geo';

export { TtlLruCache as SimpleLRUCache };

// Key format: originLat|originLng|destLat|destLng|mode
function makeRouteKey(origin: LatLng, dest: LatLng, mode: string): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}|${mode}`;
}

export const routeCache = new TtlLruCache<string, unknown>(100, 5 * 60_000);
export const geocodeCache = new TtlLruCache<string, unknown>(200, 60 * 60_000);
export const matrixCache = new TtlLruCache<string, unknown>(50, 2 * 60_000);
export const roadsCache = new TtlLruCache<string, unknown>(100, 30 * 60_000);
export const addressValidationCache = new TtlLruCache<string, unknown>(200, 24 * 60 * 60_000);
export const placesCountCache = new TtlLruCache<string, number>(300, 60 * 60_000);
export const weatherHourlyCache = new TtlLruCache<string, unknown>(200, 60 * 60_000);
export const weatherAlertsCache = new TtlLruCache<string, unknown>(100, 15 * 60_000);
export const weatherCurrentCache = new TtlLruCache<string, unknown>(200, 20 * 60_000);
export const airQualityCache = new TtlLruCache<string, unknown>(200, 30 * 60_000);
export const pollenCache = new TtlLruCache<string, unknown>(100, 60 * 60_000);
/** Isochrone GeoJSON polygons — keyed by grid + mode + duration */
export const isochroneCache = new TtlLruCache<string, unknown>(150, 30 * 60_000);

export { makeRouteKey };

export function makePlacesCountKey(lat: number, lng: number, radiusM: number): string {
  return `pc:${toGridKey(lat, lng, 4)}|${radiusM}`;
}

export function makeIsochroneKey(
  point: LatLng,
  durationS: number,
  mode: string,
  direction: string,
  routingPreference: string,
  smoothing: boolean,
  fidelity: string
): string {
  return `iso:${toGridKey(point.lat, point.lng, 3)}|${durationS}|${mode}|${direction}|${routingPreference}|s${smoothing ? 1 : 0}|${fidelity}`;
}

export function makeWeatherKey(
  lat: number,
  lng: number,
  kind: 'hourly' | 'alerts' | 'current'
): string {
  return `wx:${kind}:${toGridKey(lat, lng, 3)}`;
}

export function makeAirQualityKey(lat: number, lng: number): string {
  return `aq:${toGridKey(lat, lng, 3)}`;
}

export function makePollenKey(lat: number, lng: number): string {
  return `pollen:${toGridKey(lat, lng, 3)}`;
}

export function makeMatrixKey(
  origins: LatLng[],
  destinations: LatLng[],
  mode: string,
  departureBucket?: number
): string {
  const originHash = origins.map(o => `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`).join('|');
  const destHash = destinations.map(d => `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`).join('|');
  const dep = departureBucket != null ? `|dep${departureBucket}` : '';
  return `${originHash}→${destHash}|${mode}${dep}`;
}
