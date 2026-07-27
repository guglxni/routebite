import type { LatLng } from '@routebite/shared/types';
import { MAPS_FEATURES } from '@routebite/shared/constants';
import {
  environmentClient,
  buildEnvironmentContext,
  type AirQualitySnapshot,
  type PollenSnapshot,
} from './client';
import {
  weatherClient,
  type WeatherAlertSummary,
  type WeatherCurrentSnapshot,
  type WeatherHourlySnapshot,
} from '../weather/client';

export type OutdoorSeverity = 'good' | 'watch' | 'alert';

export interface OutdoorAdvisory {
  kind: 'air' | 'weather' | 'pollen' | 'alert';
  title: string;
  severity: OutdoorSeverity;
}

export interface OutdoorConditions {
  /** Sample point used for Google lookups (usually journey origin). */
  lat: number;
  lng: number;
  source: 'google_maps_platform';
  verified: true;
  fetchedAt: string;
  severity: OutdoorSeverity;
  airQuality?: AirQualitySnapshot;
  weather?: WeatherCurrentSnapshot & {
    hourlyPrecipProbability?: number;
    thunderstormProbability?: number;
  };
  pollen?: PollenSnapshot;
  publicAlert?: WeatherAlertSummary;
  /** Deduped human-readable lines for chips / legacy banner. */
  advisories: OutdoorAdvisory[];
  /** Compact titles for weatherWarnings compatibility. */
  warningTitles: string[];
}

function severityRank(s: OutdoorSeverity): number {
  return s === 'alert' ? 2 : s === 'watch' ? 1 : 0;
}

function maxSeverity(...levels: OutdoorSeverity[]): OutdoorSeverity {
  return levels.reduce((a, b) => (severityRank(b) > severityRank(a) ? b : a), 'good');
}

/**
 * Single verified Google Maps Platform snapshot for Outdoor Conditions UI.
 * Uses Air Quality API + Weather API (+ Pollen when available).
 */
export async function fetchOutdoorConditions(point: LatLng): Promise<OutdoorConditions> {
  const [airQuality, pollen, current, hourly, alerts] = await Promise.all([
    MAPS_FEATURES.AIR_QUALITY_SAFETY
      ? environmentClient.getAirQuality(point).catch(() => undefined)
      : Promise.resolve(undefined),
    MAPS_FEATURES.POLLEN_SAFETY
      ? environmentClient.getPollen(point).catch(() => undefined)
      : Promise.resolve(undefined),
    weatherClient.getCurrentConditions(point).catch(() => undefined),
    MAPS_FEATURES.WEATHER_SAFETY
      ? weatherClient.getHourlySnapshot(point).catch(() => undefined)
      : Promise.resolve(undefined),
    MAPS_FEATURES.WEATHER_ALERTS
      ? weatherClient.getAlerts(point).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const env = buildEnvironmentContext(airQuality, pollen);
  const advisories: OutdoorAdvisory[] = [];

  // Always surface verified AQ reading when we have it (not only risks)
  if (airQuality?.uaqi != null || airQuality?.category) {
    const localBit = airQuality.local?.aqi != null
      ? ` · ${airQuality.local.displayName ?? 'Local'} ${airQuality.local.aqi}`
      : '';
    const pollutant = airQuality.dominantPollutant
      ? ` · ${airQuality.dominantPollutant.toUpperCase()}`
      : '';
    const aqBad = env.riskTitles.some((t) => /air quality|naqi|cpcb/i.test(t));
    advisories.push({
      kind: 'air',
      title: `UAQI ${airQuality.uaqi ?? '—'} · ${airQuality.category ?? 'Air quality'}${pollutant}${localBit}`,
      severity: aqBad ? 'alert' : 'good',
    });
  }

  if (current || hourly) {
    const precip =
      current?.precipProbability ?? hourly?.precipitationProbability;
    const wxBits = [
      current?.condition,
      current?.temperatureC != null ? `${Math.round(current.temperatureC)}°C` : null,
      precip != null ? `${precip}% rain` : null,
    ].filter(Boolean);
    const wxWatch =
      (precip != null && precip >= 70) ||
      (hourly?.thunderstormProbability != null && hourly.thunderstormProbability >= 40);
    if (wxBits.length) {
      advisories.push({
        kind: 'weather',
        title: wxBits.join(' · '),
        severity: wxWatch ? 'watch' : 'good',
      });
    }
  }

  if (alerts?.hasActiveAlert && alerts.alertTitle) {
    advisories.push({
      kind: 'alert',
      title: alerts.alertTitle,
      severity: 'alert',
    });
  }

  for (const title of env.riskTitles) {
    if (/pollen/i.test(title)) {
      advisories.push({ kind: 'pollen', title, severity: 'watch' });
    } else if (!advisories.some((a) => a.title.includes(title) || title.includes(a.title))) {
      // AQ risk already shown as UAQI line — skip duplicate "Air quality: Excellent…"
      if (/air quality/i.test(title) && airQuality?.uaqi != null) continue;
      advisories.push({ kind: 'air', title, severity: 'alert' });
    }
  }

  if (pollen?.unavailable) {
    // Don't spam UI — pollen coverage gaps are common in India cities
  }

  const severity = maxSeverity(...advisories.map((a) => a.severity), 'good');

  const warningTitles = [
    ...new Set(
      advisories
        .filter((a) => a.severity !== 'good')
        .map((a) => a.title)
    ),
  ];

  return {
    lat: point.lat,
    lng: point.lng,
    source: 'google_maps_platform',
    verified: true,
    fetchedAt: new Date().toISOString(),
    severity,
    airQuality,
    weather: current
      ? {
          ...current,
          hourlyPrecipProbability: hourly?.precipitationProbability,
          thunderstormProbability: hourly?.thunderstormProbability,
        }
      : hourly
        ? {
            source: 'google_weather',
            precipProbability: hourly.precipitationProbability,
            hourlyPrecipProbability: hourly.precipitationProbability,
            thunderstormProbability: hourly.thunderstormProbability,
          }
        : undefined,
    pollen,
    publicAlert: alerts,
    advisories,
    warningTitles,
  };
}

/** Deduplicate per-intercept warning spam for legacy weatherWarnings array. */
export function dedupeWarningTitles(
  warnings: Array<{ lat: number; lng: number; title: string }>
): Array<{ lat: number; lng: number; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ lat: number; lng: number; title: string }> = [];
  for (const w of warnings) {
    const key = w.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
