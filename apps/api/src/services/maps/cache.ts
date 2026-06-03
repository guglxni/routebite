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

export { makeRouteKey };

export function makePlacesCountKey(lat: number, lng: number, radiusM: number): string {
  return `pc:${toGridKey(lat, lng, 4)}|${radiusM}`;
}

export function makeWeatherKey(lat: number, lng: number, kind: 'hourly' | 'alerts'): string {
  return `wx:${kind}:${toGridKey(lat, lng, 3)}`;
}

export function makeMatrixKey(origins: LatLng[], destinations: LatLng[], mode: string): string {
  const originHash = origins.map(o => `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`).join('|');
  const destHash = destinations.map(d => `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`).join('|');
  return `${originHash}→${destHash}|${mode}`;
}
