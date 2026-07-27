import type { LatLng } from '@routebite/shared/types';
import { MAPS_CONFIG } from '@routebite/shared/constants';
import { toGridKey } from '../../lib/geo';
import {
  GOOGLE_PLACES_AGGREGATE_BASE,
  GOOGLE_PLACES_NEARBY_BASE,
  PLACES_NEARBY_FIELD_MASK,
  PLACES_NEARBY_LOCATION_FIELD_MASK,
} from './constants';
import { placesCountCache, makePlacesCountKey } from './cache';

export interface RestaurantLocation {
  id: string;
  lat: number;
  lng: number;
  name?: string;
}

export interface PlacesClientDeps {
  apiKey: string;
  fetchFn?: typeof fetch;
}

/**
 * Count operational restaurants within radius using Places Aggregate API,
 * with Nearby Search fallback when Aggregate is unavailable.
 */
export class PlacesInsightsClient {
  private apiKey: string;
  private fetchFn: typeof fetch;

  constructor(deps: PlacesClientDeps) {
    this.apiKey = deps.apiKey;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async countRestaurantsNear(
    point: LatLng,
    radiusM: number = MAPS_CONFIG.PLACES_AGGREGATE_RADIUS_M
  ): Promise<number> {
    const cacheKey = makePlacesCountKey(point.lat, point.lng, radiusM);
    const cached = placesCountCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const count = await this.countViaAggregate(point, radiusM);
      placesCountCache.set(cacheKey, count, MAPS_CONFIG.RESTAURANT_COUNT_CACHE_TTL_MS);
      return count;
    } catch {
      try {
        const fallback = await this.countViaNearbySearch(point, radiusM);
        placesCountCache.set(cacheKey, fallback, MAPS_CONFIG.RESTAURANT_COUNT_CACHE_TTL_MS);
        return fallback;
      } catch {
        const heuristic = fallbackRestaurantCount(point);
        placesCountCache.set(cacheKey, heuristic, MAPS_CONFIG.RESTAURANT_COUNT_CACHE_TTL_MS);
        return heuristic;
      }
    }
  }

  /** Batch count with deduplication by grid cell (~100m) */
  async countRestaurantsForPoints(
    points: LatLng[],
    radiusM: number = MAPS_CONFIG.PLACES_AGGREGATE_RADIUS_M
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const seen = new Set<string>();

    for (const point of points) {
      const gridKey = toGridKey(point.lat, point.lng, 3);
      if (seen.has(gridKey)) continue;
      seen.add(gridKey);
      const count = await this.countRestaurantsNear(point, radiusM);
      results.set(gridKey, count);
    }

    return results;
  }

  resolveCountForPoint(point: LatLng, gridCounts: Map<string, number>): number {
    const gridKey = toGridKey(point.lat, point.lng, 3);
    return gridCounts.get(gridKey) ?? fallbackRestaurantCount(point);
  }

  /**
   * Nearby Search with locations — used for isochrone point-in-polygon filtering.
   * Caps at 20 results per Places API limit; radius should cover the isochrone bbox.
   */
  async listRestaurantLocationsNear(
    point: LatLng,
    radiusM: number
  ): Promise<RestaurantLocation[]> {
    const body = {
      includedTypes: ['restaurant'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: point.lat, longitude: point.lng },
          radius: Math.min(radiusM, 50000),
        },
      },
    };

    const res = await this.fetchFn(GOOGLE_PLACES_NEARBY_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': PLACES_NEARBY_LOCATION_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places Nearby (locations) error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        location?: { latitude?: number; longitude?: number };
      }>;
    };

    const out: RestaurantLocation[] = [];
    for (const p of data.places ?? []) {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      out.push({
        id: p.id ?? `${lat},${lng}`,
        lat,
        lng,
        name: p.displayName?.text,
      });
    }
    return out;
  }

  private async countViaAggregate(point: LatLng, radiusM: number): Promise<number> {
    // Places Aggregate requires OAuth/ADC — API keys return 401
    // (google-maps-platform / gmp-common-api-keys agent skill).
    const { getGoogleAccessToken } = await import('./google-auth');
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      throw new Error(
        'Places Aggregate requires Application Default Credentials (ADC); falling back to Nearby Search'
      );
    }

    const body = {
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: {
          circle: {
            center: { latitude: point.lat, longitude: point.lng },
            radius: radiusM,
          },
        },
        typeFilter: { includedTypes: ['restaurant'] },
        operatingStatus: ['OPERATING_STATUS_OPERATIONAL'],
      },
    };

    const res = await this.fetchFn(GOOGLE_PLACES_AGGREGATE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Goog-User-Project':
          process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? '',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places Aggregate error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { count?: string | number };
    return parseInt(String(data.count ?? '0'), 10);
  }

  private async countViaNearbySearch(point: LatLng, radiusM: number): Promise<number> {
    const body = {
      includedTypes: ['restaurant'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: point.lat, longitude: point.lng },
          radius: Math.min(radiusM, 50000),
        },
      },
    };

    const res = await this.fetchFn(GOOGLE_PLACES_NEARBY_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': PLACES_NEARBY_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places Nearby error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { places?: unknown[] };
    return data.places?.length ?? 0;
  }
}

/** Deterministic fallback when all Places APIs fail */
export function fallbackRestaurantCount(point: LatLng): number {
  const hash = Math.abs(Math.sin(point.lat * 100 + point.lng * 100) * 10000);
  return Math.floor(hash % 15) + 1;
}
