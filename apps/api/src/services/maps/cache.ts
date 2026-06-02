import type { LatLng } from '@routebite/shared/types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SimpleLRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();

  constructor(
    private maxSize: number,
    private defaultTtlMs: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Key format: originLat|originLng|destLat|destLng|mode
function makeRouteKey(origin: LatLng, dest: LatLng, mode: string): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}|${mode}`;
}

// Cache instances
export const routeCache = new SimpleLRUCache<string, unknown>(100, 5 * 60_000);     // 100 entries, 5 min TTL
export const geocodeCache = new SimpleLRUCache<string, unknown>(200, 60 * 60_000);  // 200 entries, 60 min TTL
export const matrixCache = new SimpleLRUCache<string, unknown>(50, 2 * 60_000);     // 50 entries, 2 min TTL (traffic-sensitive)
export const roadsCache = new SimpleLRUCache<string, unknown>(100, 30 * 60_000);    // 100 entries, 30 min TTL
export const addressValidationCache = new SimpleLRUCache<string, unknown>(200, 24 * 60 * 60_000); // 200 entries, 24h TTL
export const placesCountCache = new SimpleLRUCache<string, number>(300, 60 * 60_000);
export const weatherHourlyCache = new SimpleLRUCache<string, unknown>(200, 60 * 60_000);
export const weatherAlertsCache = new SimpleLRUCache<string, unknown>(100, 15 * 60_000);

export { makeRouteKey };

export function makePlacesCountKey(lat: number, lng: number, radiusM: number): string {
  return `pc:${lat.toFixed(4)},${lng.toFixed(4)}|${radiusM}`;
}

export function makeWeatherKey(lat: number, lng: number, kind: 'hourly' | 'alerts'): string {
  return `wx:${kind}:${lat.toFixed(3)},${lng.toFixed(3)}`;
}

// Matrix key: hash of origin|dest|mode
export function makeMatrixKey(origins: LatLng[], destinations: LatLng[], mode: string): string {
  const originHash = origins.map(o => `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`).join('|');
  const destHash = destinations.map(d => `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`).join('|');
  return `${originHash}→${destHash}|${mode}`;
}
