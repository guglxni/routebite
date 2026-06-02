import type { LatLng } from '@routebite/shared/types';
import type { CandidatePoint } from './types';
import type { JourneyRoute, SpeedReadingInterval } from '../maps/types';
import { haversineDistance } from './utils';

const TRAFFIC_DWELL_BONUS: Record<SpeedReadingInterval['speed'], number> = {
  NORMAL: 0,
  SLOW: 30,
  TRAFFIC_JAM: 90,
};

/**
 * Increase dwell time when the intercept lies on or near a traffic-heavy segment.
 */
export function adjustDwellForTraffic(candidate: CandidatePoint, route: JourneyRoute): number {
  const intervals = route.travelAdvisory?.speedReadingIntervals;
  if (!intervals?.length || route.polylinePoints.length < 2) {
    return candidate.dwellTime;
  }

  const nearestSpeed = findNearestTrafficSpeed(candidate, route.polylinePoints, intervals);
  if (!nearestSpeed) return candidate.dwellTime;

  return candidate.dwellTime + TRAFFIC_DWELL_BONUS[nearestSpeed];
}

function findNearestTrafficSpeed(
  candidate: LatLng,
  polyline: LatLng[],
  intervals: SpeedReadingInterval[]
): SpeedReadingInterval['speed'] | undefined {
  let bestDist = Infinity;
  let bestSpeed: SpeedReadingInterval['speed'] | undefined;

  for (const interval of intervals) {
    const start = polyline[interval.startPolylinePointIndex];
    const end = polyline[Math.min(interval.endPolylinePointIndex, polyline.length - 1)];
    if (!start || !end) continue;

    const mid = {
      lat: (start.lat + end.lat) / 2,
      lng: (start.lng + end.lng) / 2,
    };
    const d = haversineDistance(candidate, mid);
    if (d < bestDist && d < 400) {
      bestDist = d;
      bestSpeed = interval.speed;
    }
  }

  return bestSpeed;
}

/**
 * When Routes API returns toll info, synthesize toll plaza intercept candidates
 * at step end locations with toll instructions.
 */
export function detectTollCandidatesFromRoute(route: JourneyRoute): CandidatePoint[] {
  if (!route.hasTolls && !route.travelAdvisory?.tollInfo) return [];

  const candidates: CandidatePoint[] = [];
  let distanceFromStart = 0;

  for (const step of route.steps) {
    distanceFromStart += step.distanceMeters ?? 0;
    const instruction = (step.navigationInstruction?.instructions ?? '').toLowerCase();
    if (instruction.includes('toll')) {
      candidates.push({
        lat: step.endLocation.latLng.lat,
        lng: step.endLocation.latLng.lng,
        type: 'toll_plaza',
        dwellTime: 180,
        distanceFromStart,
        safetyRating: 4,
        restaurantCount: 2,
      });
    }
  }

  return candidates;
}
