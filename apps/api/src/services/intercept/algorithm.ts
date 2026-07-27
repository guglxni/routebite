import type { TransportMode } from '@routebite/shared/types';
import { INTERCEPT_ALGORITHMS, INTERCEPT_SCORING } from '@routebite/shared/constants';
import { GeohashSpatialIndex } from '@routebite/shared/algorithms';
import type { JourneyRoute } from '../maps/types';
import { mapsClient } from '../maps/client';
import type { CandidatePoint, ScoredInterceptPoint, RouteAnalysisInput, InterceptConfig } from './types';
import { scoreInterceptPoint, filterAndRankPoints } from './scoring';
import { enrichCandidates } from './enrichment';
import { haversineDistance, estimateSpeed, makeInterceptId } from './utils';

const DEFAULT_CONFIG: InterceptConfig = {
  minScore: INTERCEPT_SCORING.MIN_SCORE,
  minDwellTime: INTERCEPT_SCORING.MIN_DWELL_TIME_S,
  maxPoints: 5,
  intervalMeters: 500,
};

/**
 * Extract candidate intercept points from a computed route.
 * For transit: use stops. For road: use traffic lights, intersections, tolls.
 * Also add evenly-spaced fallback points.
 */
export function extractCandidates(
  input: RouteAnalysisInput,
  config: InterceptConfig = DEFAULT_CONFIG
): CandidatePoint[] {
  const candidates: CandidatePoint[] = [];
  const { routePoints, steps, transportMode } = input;

  if (routePoints.length === 0) return candidates;

  // ─── Transit mode: use official stops ───────────────
  if (['bus', 'train', 'metro'].includes(transportMode)) {
    for (const step of steps) {
      if (step.transitDetails) {
        const { arrivalStop, departureStop } = step.transitDetails.stopDetails;
        for (const stop of [departureStop, arrivalStop]) {
          candidates.push({
            lat: stop.location.latLng.lat,
            lng: stop.location.latLng.lng,
            type: 'stop',
            dwellTime: transportMode === 'train' ? 120 : 60, // trains dwell longer
            distanceFromStart: distanceAlongRoute(stop.location.latLng, routePoints),
            name: stop.name,
            safetyRating: 4,
            restaurantCount: estimateRestaurantCount(stop.location.latLng),
          });
        }
      }
    }
  }

  // ─── Road mode: use navigation instructions ─────────
  else {
    for (const step of steps) {
      const instruction = (step.navigationInstruction?.instructions ?? '').toLowerCase();
      const maneuver = (step.navigationInstruction?.maneuver ?? '').toLowerCase();

      // Traffic lights
      if (instruction.includes('traffic light') || maneuver.includes('traffic')) {
        candidates.push({
          lat: step.endLocation.latLng.lat,
          lng: step.endLocation.latLng.lng,
          type: 'traffic_light',
          dwellTime: 45, // avg red light + approach delay
          distanceFromStart: distanceAlongRoute(step.endLocation.latLng, routePoints),
          safetyRating: 3.5,
          restaurantCount: estimateRestaurantCount(step.endLocation.latLng),
        });
      }

      // Toll plazas
      else if (instruction.includes('toll')) {
        candidates.push({
          lat: step.endLocation.latLng.lat,
          lng: step.endLocation.latLng.lng,
          type: 'toll_plaza',
          dwellTime: 180, // stopping to pay toll
          distanceFromStart: distanceAlongRoute(step.endLocation.latLng, routePoints),
          safetyRating: 4,
          restaurantCount: estimateRestaurantCount(step.endLocation.latLng),
        });
      }

      // Petrol pumps (detected by name in instructions)
      else if (instruction.includes('petrol') || instruction.includes('fuel')) {
        candidates.push({
          lat: step.endLocation.latLng.lat,
          lng: step.endLocation.latLng.lng,
          type: 'petrol_pump',
          dwellTime: 300, // 5 min fuel stop
          distanceFromStart: distanceAlongRoute(step.endLocation.latLng, routePoints),
          safetyRating: 4,
          restaurantCount: estimateRestaurantCount(step.endLocation.latLng) + 2, // pumps often have stalls
        });
      }
    }
  }

  // ─── Fallback: evenly spaced points ─────────────────
  const totalDistance = distanceAlongRoute(routePoints[routePoints.length - 1], routePoints);
  const spacing = totalDistance / 8; // aim for ~8 points
  const useSpatialDedup = candidates.length > INTERCEPT_ALGORITHMS.GEOHASH_SPATIAL_THRESHOLD;
  const dedupGrid = useSpatialDedup ? new GeohashSpatialIndex(300) : null;
  if (dedupGrid) {
    for (const c of candidates) dedupGrid.add(c.lat, c.lng);
  }

  for (let dist = spacing; dist < totalDistance; dist += spacing) {
    const point = interpolateAlongRoute(dist, routePoints);
    const tooClose = dedupGrid
      ? dedupGrid.hasWithin(point.lat, point.lng, 300)
      : candidates.some((c) => haversineDistance(point, c) < 300);
    if (!tooClose) {
      candidates.push({
        lat: point.lat,
        lng: point.lng,
        type: 'dynamic',
        dwellTime: 120, // 2 min pull-over
        distanceFromStart: dist,
        safetyRating: 3,
        restaurantCount: estimateRestaurantCount(point),
      });
      dedupGrid?.add(point.lat, point.lng);
    }
  }

  // Keep all candidates; scoring + filterAndRankPoints apply quality thresholds
  return candidates;
}

/**
 * Score candidates and compute ETAs. Returns ranked intercept points.
 * Optionally snaps final points to nearest roads for real-world accuracy.
 */
export async function computeInterceptPoints(
  input: RouteAnalysisInput,
  route: JourneyRoute,
  config: InterceptConfig = DEFAULT_CONFIG,
  opts?: { snapToRoads?: boolean; departureTime?: Date }
): Promise<ScoredInterceptPoint[]> {
  const rawCandidates = extractCandidates(input, config);

  const candidates = await enrichCandidates(rawCandidates, {
    transportMode: input.transportMode,
    route,
    departureTime: opts?.departureTime,
  });

  const speed = estimateSpeed(input.transportMode);

  const scored: ScoredInterceptPoint[] = candidates.map(c => ({
    ...c,
    score: scoreInterceptPoint(c),
    customerETA: Math.round(c.distanceFromStart / speed),
  }));

  const ranked = filterAndRankPoints(scored, config.minScore, config.maxPoints, config.intervalMeters);

  // Snap final intercept points to actual roads for accuracy
  if (opts?.snapToRoads && ranked.length > 0) {
    try {
      const snapped = await mapsClient.snapToRoads(
        ranked.map(p => ({ lat: p.lat, lng: p.lng }))
      );
      for (let i = 0; i < snapped.length && i < ranked.length; i++) {
        ranked[i].lat = snapped[i].lat;
        ranked[i].lng = snapped[i].lng;
      }
    } catch {
      // Fall back to un-snapped points
    }
  }

  // Isochrones: true rider/walk reachability on final ranked set, then re-score
  return attachIsochroneReachability(ranked);
}

/** Attach Isochrones polygons + PIP restaurant counts; re-score with REACHABILITY weight. */
export async function attachIsochroneReachability(
  points: ScoredInterceptPoint[]
): Promise<ScoredInterceptPoint[]> {
  if (points.length === 0) return points;
  try {
    const withReach = await mapsClient.attachReachabilityToPoints(points);
    return withReach.map((p) => ({
      ...p,
      score: scoreInterceptPoint(p),
    }));
  } catch (err) {
    console.warn(
      '[intercept] isochrone attach failed:',
      err instanceof Error ? err.message : err
    );
    return points;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function distanceAlongRoute(point: { lat: number; lng: number }, route: Array<{ lat: number; lng: number }>): number {
  let dist = 0;
  let minDist = Infinity;
  let accumulated = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const dab = haversineDistance(a, b);

    // Project point onto segment [a,b]
    const t = projectOnSegment(point, a, b);
    const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = haversineDistance(point, proj);

    if (d < minDist) {
      minDist = d;
      dist = accumulated + dab * t;
    }

    accumulated += dab;
  }

  return dist;
}

function interpolateAlongRoute(distance: number, route: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  let accumulated = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const d = haversineDistance(a, b);

    if (accumulated + d >= distance) {
      const t = (distance - accumulated) / d;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
    }

    accumulated += d;
  }

  return route[route.length - 1];
}

function projectOnSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const abLat = b.lat - a.lat;
  const abLng = b.lng - a.lng;
  const apLat = p.lat - a.lat;
  const apLng = p.lng - a.lng;
  const ab2 = abLat * abLat + abLng * abLng;
  if (ab2 === 0) return 0;
  return Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / ab2));
}

function estimateRestaurantCount(point: { lat: number; lng: number }): number {
  // Deterministic pseudo-count based on lat/lng hash
  // In production, this would call Places API
  const hash = Math.abs(Math.sin(point.lat * 100 + point.lng * 100) * 10000);
  return Math.floor(hash % 15) + 1; // 1–15 restaurants
}
