import type { LatLng } from '@routebite/shared/types';
import {
  MAPS_CONFIG,
  MAPS_FEATURES,
  ISOCHRONE,
} from '@routebite/shared/constants';
import {
  simplifyGeoJson,
  type GeoJsonPolygonGeometry,
} from '@routebite/shared/algorithms';
import { toGridKey } from '../../lib/geo';
import { isochroneCache, makeIsochroneKey } from './cache';
import { GOOGLE_ISOCHRONES_BASE } from './constants';
import { withGoogleRetry } from './retry';

export type IsochroneTravelMode = 'DRIVE' | 'WALK' | 'BICYCLE';
export type IsochroneTravelDirection = 'FROM' | 'TO';
export type IsochroneRoutingPreference = 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE';
export type IsochronePolygonFidelity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface GenerateIsochroneParams {
  location: LatLng;
  /** Duration in seconds (will be formatted as `${n}s`). */
  travelDurationSeconds: number;
  travelMode: IsochroneTravelMode;
  travelDirection: IsochroneTravelDirection;
  routingPreference?: IsochroneRoutingPreference;
  enableSmoothing?: boolean;
  polygonFidelity?: IsochronePolygonFidelity;
  /** If true, simplify polygon for storage/UI. */
  simplify?: boolean;
}

export interface IsochroneResult {
  geometry: GeoJsonPolygonGeometry;
  travelDurationSeconds: number;
  travelMode: IsochroneTravelMode;
  travelDirection: IsochroneTravelDirection;
  fromCache: boolean;
}

interface GenerateIsochroneResponse {
  isochrone?: {
    geoJson?: GeoJsonPolygonGeometry;
  };
  error?: { message?: string; status?: string };
}

/**
 * Google Maps Platform Isochrones API client.
 * @see https://developers.google.com/maps/documentation/isochrones/create-isochrone
 */
export class IsochronesClient {
  private apiKey: string;
  private fetchFn: typeof fetch;

  constructor(apiKey: string, fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  async generate(params: GenerateIsochroneParams): Promise<IsochroneResult> {
    if (!MAPS_FEATURES.ISOCHRONES) {
      throw new Error('Isochrones feature disabled (MAPS_FEATURES.ISOCHRONES)');
    }
    if (!this.apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY not set');
    }

    const durationS = clampDuration(params.travelDurationSeconds, params.travelMode);
    const preference =
      params.routingPreference ??
      (params.travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE');
    // Traffic-aware only valid for DRIVE
    const routingPreference =
      params.travelMode === 'DRIVE' ? preference : 'TRAFFIC_UNAWARE';

    const enableSmoothing = params.enableSmoothing ?? false;
    const fidelity = params.polygonFidelity ?? 'MEDIUM';

    const cacheKey = makeIsochroneKey(
      params.location,
      durationS,
      params.travelMode,
      params.travelDirection,
      routingPreference,
      enableSmoothing,
      fidelity
    );

    const cached = isochroneCache.get(cacheKey) as GeoJsonPolygonGeometry | undefined;
    if (cached) {
      return {
        geometry: cached,
        travelDurationSeconds: durationS,
        travelMode: params.travelMode,
        travelDirection: params.travelDirection,
        fromCache: true,
      };
    }

    const body = {
      location: {
        latitude: params.location.lat,
        longitude: params.location.lng,
      },
      travelDuration: `${durationS}s`,
      travelMode: params.travelMode,
      travelDirection: params.travelDirection,
      routingPreference,
      enableSmoothing,
      polygonFidelity: fidelity,
    };

    const geometry = await withGoogleRetry(async () => {
      const res = await this.fetchFn(GOOGLE_ISOCHRONES_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let data: GenerateIsochroneResponse;
      try {
        data = JSON.parse(text) as GenerateIsochroneResponse;
      } catch {
        throw new Error(`Isochrones non-JSON ${res.status}: ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(
          `Isochrones error ${res.status}: ${data.error?.message ?? text.slice(0, 200)}`
        );
      }

      const geo = data.isochrone?.geoJson;
      if (!geo || (geo.type !== 'Polygon' && geo.type !== 'MultiPolygon')) {
        throw new Error('Isochrones response missing geoJson MultiPolygon/Polygon');
      }
      return geo;
    });

    const stored =
      params.simplify !== false
        ? simplifyGeoJson(geometry, MAPS_CONFIG.ISOCHRONE_SIMPLIFY_STRIDE)
        : geometry;

    isochroneCache.set(cacheKey, stored, MAPS_CONFIG.ISOCHRONE_CACHE_TTL_MS);

    return {
      geometry: stored,
      travelDurationSeconds: durationS,
      travelMode: params.travelMode,
      travelDirection: params.travelDirection,
      fromCache: false,
    };
  }
}

function clampDuration(seconds: number, mode: IsochroneTravelMode): number {
  const raw = Math.max(60, Math.round(seconds));
  if (mode === 'DRIVE') return Math.min(raw, 3600);
  return Math.min(raw, 7200);
}

/**
 * Derive rider inbound travel budget from intercept dwell.
 * Formula: (dwell - prepReserve - safety - traffic) * bikeBuffer, clamped.
 */
export function computeRiderBudgetSeconds(
  dwellSeconds: number,
  opts?: { prepReserveS?: number; safetyBufferS?: number; trafficBufferS?: number }
): number {
  const prep = opts?.prepReserveS ?? ISOCHRONE.PREP_RESERVE_S;
  const safety = opts?.safetyBufferS ?? 10 * 60;
  const traffic = opts?.trafficBufferS ?? 5 * 60;
  const raw = dwellSeconds - prep - safety - traffic;
  const buffered = Math.round(Math.max(0, raw) * ISOCHRONE.BIKE_BUFFER_RATIO);
  return Math.min(
    ISOCHRONE.RIDER_MAX_BUDGET_S,
    Math.max(ISOCHRONE.RIDER_MIN_BUDGET_S, buffered || ISOCHRONE.RIDER_MIN_BUDGET_S)
  );
}

/** Cache-friendly grid key for an intercept (exported for tests). */
export function isochroneGridKey(point: LatLng): string {
  return toGridKey(point.lat, point.lng, MAPS_CONFIG.ISOCHRONE_CACHE_GRID_PRECISION);
}
