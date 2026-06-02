import type { LatLng, TransportMode } from '@routebite/shared/types';
import { MAPS_FEATURES } from '@routebite/shared/constants';
import type { CandidatePoint } from './types';
import type { JourneyRoute } from '../maps/types';
import { mapsClient } from '../maps/client';
import { weatherClient, applyWeatherToSafetyRating } from '../weather/client';
import { adjustDwellForTraffic, detectTollCandidatesFromRoute } from './traffic';

export interface EnrichmentOptions {
  transportMode: TransportMode;
  route?: JourneyRoute;
  departureTime?: Date;
}

export interface EnrichedCandidate extends CandidatePoint {
  weatherRisk?: boolean;
  weatherAlertTitle?: string;
}

/**
 * Enrich intercept candidates with real restaurant counts, traffic-adjusted dwell,
 * and weather-aware safety ratings.
 */
export async function enrichCandidates(
  candidates: CandidatePoint[],
  opts: EnrichmentOptions
): Promise<EnrichedCandidate[]> {
  if (candidates.length === 0) return [];

  let enriched: EnrichedCandidate[] = candidates.map(c => ({ ...c }));

  if (MAPS_FEATURES.PLACES_AGGREGATE) {
    try {
      const gridCounts = await mapsClient.countRestaurantsForPoints(
        candidates.map(c => ({ lat: c.lat, lng: c.lng }))
      );
      enriched = enriched.map(c => ({
        ...c,
        restaurantCount: mapsClient.resolveRestaurantCount({ lat: c.lat, lng: c.lng }, gridCounts),
      }));
    } catch {
      // Keep heuristic counts from extractCandidates
    }
  }

  if (MAPS_FEATURES.ROUTES_EXTRA_COMPUTATIONS && opts.route) {
    enriched = mergeTollCandidatesFromRoute(enriched, opts.route);
  }

  if (MAPS_FEATURES.TRAFFIC_DWELL_ADJUSTMENT && opts.route?.travelAdvisory?.speedReadingIntervals) {
    enriched = enriched.map(c => ({
      ...c,
      dwellTime: adjustDwellForTraffic(c, opts.route!),
    }));
  }

  if (MAPS_FEATURES.WEATHER_SAFETY) {
    enriched = await Promise.all(
      enriched.map(async c => {
        try {
          const wx = await weatherClient.getContextForPoint({ lat: c.lat, lng: c.lng });
          return {
            ...c,
            safetyRating: applyWeatherToSafetyRating(c.safetyRating ?? 3, wx),
            weatherRisk: Boolean(wx.alerts?.hasActiveAlert),
            weatherAlertTitle: wx.alerts?.alertTitle,
          };
        } catch {
          return c;
        }
      })
    );
  }

  return enriched;
}

function mergeTollCandidatesFromRoute(
  candidates: EnrichedCandidate[],
  route: JourneyRoute
): EnrichedCandidate[] {
  const tollPoints = detectTollCandidatesFromRoute(route);
  if (tollPoints.length === 0) return candidates;

  const merged = [...candidates];
  for (const toll of tollPoints) {
    const exists = merged.some(
      c => haversineM(c, toll) < 200 && c.type === 'toll_plaza'
    );
    if (!exists) {
      merged.push({
        ...toll,
        restaurantCount: toll.restaurantCount ?? 1,
        safetyRating: toll.safetyRating ?? 4,
      });
    }
  }
  return merged;
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
