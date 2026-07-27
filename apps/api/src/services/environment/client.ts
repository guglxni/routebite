import type { LatLng } from '@routebite/shared/types';
import { MAPS_CONFIG } from '@routebite/shared/constants';
import { GOOGLE_AIR_QUALITY_BASE, GOOGLE_POLLEN_BASE } from '../maps/constants';
import {
  airQualityCache,
  pollenCache,
  makeAirQualityKey,
  makePollenKey,
} from '../maps/cache';

export interface LocalAqiSnapshot {
  code: string;
  displayName?: string;
  aqi?: number;
  category?: string;
  dominantPollutant?: string;
}

export interface AirQualitySnapshot {
  /** Google Universal AQI — higher = better (0 Poor … 100 Excellent). */
  uaqi?: number;
  category?: string;
  dominantPollutant?: string;
  /** Prefer India CPCB NAQI when present (higher = worse). */
  local?: LocalAqiSnapshot;
  source: 'google_air_quality';
}

export interface PollenSnapshot {
  maxIndex?: number;
  plantDescriptions?: string[];
  source: 'google_pollen';
  unavailable?: boolean;
}

export interface EnvironmentContext {
  airQuality?: AirQualitySnapshot;
  pollen?: PollenSnapshot;
  safetyPenalty: number;
  outdoorRisk: boolean;
  riskTitles: string[];
}

export interface EnvironmentClientDeps {
  apiKey: string;
  fetchFn?: typeof fetch;
}

export class EnvironmentClient {
  private apiKey: string;
  private fetchFn: typeof fetch;

  constructor(deps: EnvironmentClientDeps) {
    this.apiKey = deps.apiKey;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async getAirQuality(point: LatLng): Promise<AirQualitySnapshot> {
    const cacheKey = makeAirQualityKey(point.lat, point.lng);
    const cached = airQualityCache.get(cacheKey);
    if (cached) return cached as AirQualitySnapshot;

    const res = await this.fetchFn(`${GOOGLE_AIR_QUALITY_BASE}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { latitude: point.lat, longitude: point.lng },
        universalAqi: true,
        extraComputations: ['LOCAL_AQI'],
        languageCode: 'en',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Air Quality error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      indexes?: Array<{
        code?: string;
        displayName?: string;
        aqi?: number;
        category?: string;
        dominantPollutant?: string;
      }>;
    };

    const uaqi = data.indexes?.find((i) => i.code === 'uaqi');
    const localIdx =
      data.indexes?.find((i) => i.code && i.code !== 'uaqi') ?? undefined;

    const snapshot: AirQualitySnapshot = {
      uaqi: uaqi?.aqi,
      category: uaqi?.category,
      dominantPollutant: uaqi?.dominantPollutant,
      local: localIdx
        ? {
            code: localIdx.code ?? 'local',
            displayName: localIdx.displayName,
            aqi: localIdx.aqi,
            category: localIdx.category,
            dominantPollutant: localIdx.dominantPollutant,
          }
        : undefined,
      source: 'google_air_quality',
    };

    airQualityCache.set(cacheKey, snapshot, MAPS_CONFIG.AIR_QUALITY_CACHE_TTL_MS);
    return snapshot;
  }

  async getPollen(point: LatLng): Promise<PollenSnapshot> {
    const cacheKey = makePollenKey(point.lat, point.lng);
    const cached = pollenCache.get(cacheKey);
    if (cached) return cached as PollenSnapshot;

    const url = new URL(GOOGLE_POLLEN_BASE);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('location.latitude', String(point.lat));
    url.searchParams.set('location.longitude', String(point.lng));
    url.searchParams.set('days', '1');
    url.searchParams.set('plantsDescription', 'true');
    url.searchParams.set('languageCode', 'en');

    const res = await this.fetchFn(url.toString());
    if (!res.ok) {
      // Bengaluru often has no pollen coverage — soft fail
      if (res.status === 404 || res.status === 400) {
        const empty: PollenSnapshot = {
          source: 'google_pollen',
          unavailable: true,
        };
        pollenCache.set(cacheKey, empty, MAPS_CONFIG.POLLEN_CACHE_TTL_MS);
        return empty;
      }
      const text = await res.text();
      throw new Error(`Pollen error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      dailyInfo?: Array<{
        plantInfo?: Array<{
          displayName?: string;
          indexInfo?: { value?: number; category?: string };
        }>;
        pollenTypeInfo?: Array<{
          displayName?: string;
          indexInfo?: { value?: number };
        }>;
      }>;
    };

    const day = data.dailyInfo?.[0];
    const indexes = [
      ...(day?.pollenTypeInfo ?? []).map((p) => p.indexInfo?.value ?? 0),
      ...(day?.plantInfo ?? []).map((p) => p.indexInfo?.value ?? 0),
    ];
    const maxIndex = indexes.length > 0 ? Math.max(...indexes) : undefined;
    const plantDescriptions = (day?.plantInfo ?? [])
      .filter((p) => (p.indexInfo?.value ?? 0) >= MAPS_CONFIG.POLLEN_INDEX_WARNING)
      .map((p) => p.displayName)
      .filter((n): n is string => Boolean(n));

    const snapshot: PollenSnapshot = {
      maxIndex,
      plantDescriptions,
      source: 'google_pollen',
    };
    pollenCache.set(cacheKey, snapshot, MAPS_CONFIG.POLLEN_CACHE_TTL_MS);
    return snapshot;
  }
}

/**
 * Google UAQI: higher = better. Penalize Low/Poor bands (uaqi < MIN_OK).
 * Local CPCB NAQI (India): higher = worse — warn at LOCAL_AQI_WARNING+.
 */
export function buildEnvironmentContext(
  airQuality?: AirQualitySnapshot,
  pollen?: PollenSnapshot
): EnvironmentContext {
  let safetyPenalty = 0;
  const riskTitles: string[] = [];

  if (
    airQuality?.uaqi !== undefined &&
    airQuality.uaqi < MAPS_CONFIG.AIR_QUALITY_UAQI_MIN_OK
  ) {
    safetyPenalty += MAPS_CONFIG.AIR_QUALITY_SAFETY_PENALTY;
    const label = airQuality.category ?? `UAQI ${airQuality.uaqi}`;
    const pollutant = airQuality.dominantPollutant
      ? ` · ${airQuality.dominantPollutant.toUpperCase()}`
      : '';
    riskTitles.push(`Air quality: ${label}${pollutant}`);
  }

  if (
    airQuality?.local?.aqi !== undefined &&
    airQuality.local.aqi >= MAPS_CONFIG.AIR_QUALITY_LOCAL_AQI_WARNING
  ) {
    safetyPenalty += MAPS_CONFIG.AIR_QUALITY_SAFETY_PENALTY * 0.75;
    const name = airQuality.local.displayName ?? airQuality.local.code;
    riskTitles.push(
      `${name}: ${airQuality.local.category ?? airQuality.local.aqi}`
    );
  }

  if (
    pollen?.maxIndex !== undefined &&
    !pollen.unavailable &&
    pollen.maxIndex >= MAPS_CONFIG.POLLEN_INDEX_WARNING
  ) {
    safetyPenalty += MAPS_CONFIG.POLLEN_SAFETY_PENALTY;
    const plants = pollen.plantDescriptions?.slice(0, 2).join(', ');
    riskTitles.push(plants ? `High pollen (${plants})` : 'Elevated pollen levels');
  }

  return {
    airQuality,
    pollen,
    safetyPenalty,
    outdoorRisk: riskTitles.length > 0,
    riskTitles,
  };
}

export function applyEnvironmentToSafetyRating(
  baseRating: number,
  context: EnvironmentContext
): number {
  return Math.max(1, Math.min(5, baseRating - context.safetyPenalty));
}

const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';
export const environmentClient = new EnvironmentClient({ apiKey: API_KEY });
