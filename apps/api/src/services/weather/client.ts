import type { LatLng } from '@routebite/shared/types';
import { MAPS_CONFIG } from '@routebite/shared/constants';
import {
  GOOGLE_WEATHER_ALERTS_BASE,
  GOOGLE_WEATHER_HOURLY_BASE,
} from '../maps/constants';
import { weatherAlertsCache, weatherHourlyCache, makeWeatherKey } from '../maps/cache';

export interface WeatherHourlySnapshot {
  precipitationProbability?: number;
  thunderstormProbability?: number;
  visibilityMeters?: number;
}

export interface WeatherAlertSummary {
  hasActiveAlert: boolean;
  alertTitle?: string;
  severity?: string;
  eventType?: string;
}

export interface WeatherContext {
  hourly?: WeatherHourlySnapshot;
  alerts?: WeatherAlertSummary;
  safetyPenalty: number;
  timingBufferSeconds: number;
}

export interface WeatherClientDeps {
  apiKey: string;
  fetchFn?: typeof fetch;
  languageCode?: string;
}

export class WeatherClient {
  private apiKey: string;
  private fetchFn: typeof fetch;
  private languageCode: string;

  constructor(deps: WeatherClientDeps) {
    this.apiKey = deps.apiKey;
    this.fetchFn = deps.fetchFn ?? fetch;
    this.languageCode = deps.languageCode ?? MAPS_CONFIG.WEATHER_LANGUAGE;
  }

  async getContextForPoint(point: LatLng): Promise<WeatherContext> {
    const [hourly, alerts] = await Promise.all([
      this.getHourlySnapshot(point).catch(() => undefined),
      this.getAlerts(point).catch(() => ({ hasActiveAlert: false })),
    ]);

    return buildWeatherContext(hourly, alerts);
  }

  async getHourlySnapshot(point: LatLng): Promise<WeatherHourlySnapshot> {
    const cacheKey = makeWeatherKey(point.lat, point.lng, 'hourly');
    const cached = weatherHourlyCache.get(cacheKey);
    if (cached) return cached as WeatherHourlySnapshot;

    const url = new URL(GOOGLE_WEATHER_HOURLY_BASE);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('location.latitude', String(point.lat));
    url.searchParams.set('location.longitude', String(point.lng));
    url.searchParams.set('hours', '1');
    url.searchParams.set('pageSize', '1');

    const res = await this.fetchFn(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Weather hourly error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      forecastHours?: Array<{
        precipitation?: { probability?: { percent?: number } };
        thunderstormProbability?: number;
        visibility?: { distance?: number };
      }>;
    };

    const hour = data.forecastHours?.[0];
    const snapshot: WeatherHourlySnapshot = {
      precipitationProbability: hour?.precipitation?.probability?.percent,
      thunderstormProbability: hour?.thunderstormProbability,
      visibilityMeters: hour?.visibility?.distance,
    };

    weatherHourlyCache.set(cacheKey, snapshot, MAPS_CONFIG.WEATHER_CACHE_TTL_MS);
    return snapshot;
  }

  async getAlerts(point: LatLng): Promise<WeatherAlertSummary> {
    const cacheKey = makeWeatherKey(point.lat, point.lng, 'alerts');
    const cached = weatherAlertsCache.get(cacheKey);
    if (cached) return cached as WeatherAlertSummary;

    const url = new URL(GOOGLE_WEATHER_ALERTS_BASE);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('location.latitude', String(point.lat));
    url.searchParams.set('location.longitude', String(point.lng));
    url.searchParams.set('languageCode', this.languageCode);

    const res = await this.fetchFn(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Weather alerts error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      weatherAlerts?: Array<{
        alertTitle?: { text?: string } | string;
        severity?: string;
        eventType?: string;
      }>;
    };

    const first = data.weatherAlerts?.[0];
    const title =
      typeof first?.alertTitle === 'string'
        ? first.alertTitle
        : first?.alertTitle?.text;

    const summary: WeatherAlertSummary = {
      hasActiveAlert: Boolean(first),
      alertTitle: title,
      severity: first?.severity,
      eventType: first?.eventType,
    };

    weatherAlertsCache.set(cacheKey, summary, MAPS_CONFIG.WEATHER_ALERT_CACHE_TTL_MS);
    return summary;
  }
}

export function buildWeatherContext(
  hourly?: WeatherHourlySnapshot,
  alerts?: WeatherAlertSummary
): WeatherContext {
  let safetyPenalty = 0;
  let timingBufferSeconds = 0;

  if (
    hourly?.precipitationProbability !== undefined &&
    hourly.precipitationProbability >= MAPS_CONFIG.WEATHER_PRECIP_WARNING_PCT
  ) {
    safetyPenalty += MAPS_CONFIG.WEATHER_SAFETY_PENALTY;
    timingBufferSeconds += MAPS_CONFIG.WEATHER_TIMING_BUFFER_S;
  }

  if (hourly?.visibilityMeters !== undefined && hourly.visibilityMeters < 2000) {
    safetyPenalty += 0.3;
  }

  if (alerts?.hasActiveAlert) {
    safetyPenalty += MAPS_CONFIG.WEATHER_SAFETY_PENALTY;
    timingBufferSeconds += MAPS_CONFIG.WEATHER_TIMING_BUFFER_S;
  }

  return { hourly, alerts, safetyPenalty, timingBufferSeconds };
}

export function applyWeatherToSafetyRating(baseRating: number, context: WeatherContext): number {
  return Math.max(1, Math.min(5, baseRating - context.safetyPenalty));
}

const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';
export const weatherClient = new WeatherClient({ apiKey: API_KEY });
