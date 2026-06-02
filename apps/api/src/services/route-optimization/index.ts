import type { LatLng, TransportMode } from '@routebite/shared/types';
import { mapsClient } from '../maps/client';

export interface Waypoint {
  lat: number;
  lng: number;
  name?: string;
  type: 'origin' | 'destination' | 'pickup' | 'delivery';
  dwellMinutes?: number;
}

export interface OptimizedRoute {
  /** Optimized order of waypoint indices */
  optimizedOrder: number[];
  /** Total duration in seconds */
  totalDurationSeconds: number;
  /** Total distance in meters */
  totalDistanceMeters: number;
  /** Per-leg breakdown */
  legs: Array<{
    fromIndex: number;
    toIndex: number;
    durationSeconds: number;
    distanceMeters: number;
    polyline: string;
  }>;
}

/**
 * Route Optimization Service
 *
 * Optimizes multi-stop delivery routes using the Google Maps Routes API.
 * Given a set of waypoints (origin → pickups → destination), finds the
 * optimal ordering that minimizes total travel time.
 *
 * Inspired by SimplyDelivery's batch delivery optimization:
 * https://cloud.google.com/customers/simply-delivery
 *
 * Use cases:
 * - Multi-intercept food orders (pick up at 2+ restaurants)
 * - Batch instamart pickups along a commute
 * - Optimized driver routes for "auto" placed orders
 */
export async function optimizeMultiStopRoute(
  waypoints: Waypoint[],
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints required');
  }

  // Find origin and destination indices
  const originIdx = waypoints.findIndex(w => w.type === 'origin');
  const destIdx = waypoints.findIndex(w => w.type === 'destination');

  if (originIdx === -1 || destIdx === -1) {
    throw new Error('Origin and destination waypoints are required');
  }

  // Extract intermediate stops (pickups)
  const intermediate = waypoints
    .map((w, i) => ({ ...w, index: i }))
    .filter(w => w.type === 'pickup');

  // For small numbers of pickups (≤6), use brute-force optimization
  // since the Routes API doesn't provide a built-in TSP solver.
  // For larger numbers, use a greedy heuristic.
  if (intermediate.length <= 6) {
    return bruteForceOptimize(waypoints, originIdx, destIdx, intermediate, transportMode);
  }

  return greedyOptimize(waypoints, originIdx, destIdx, intermediate, transportMode);
}

/**
 * Brute-force TSP for small pickup counts (≤6).
 * Tries all permutations of intermediate stops and picks the fastest route.
 */
async function bruteForceOptimize(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>,
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  // Generate all permutations of intermediate stops
  const perms = permutations(intermediates.map(i => i.index));

  let best: OptimizedRoute | undefined;

  for (const perm of perms) {
    const route = await evaluateRoute(
      waypoints,
      [originIdx, ...perm, destIdx],
      transportMode
    );

    if (!best || route.totalDurationSeconds < best.totalDurationSeconds) {
      best = route;
    }
  }

  return best!;
}

/**
 * Greedy nearest-neighbor for larger pickup counts.
 * Starts at origin, repeatedly picks the nearest unvisited pickup, ends at destination.
 */
async function greedyOptimize(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>,
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  const unvisited = new Set(intermediates.map(i => i.index));
  const order = [originIdx];

  // Pre-compute distance matrix for all waypoints
  const coords = waypoints.map(w => ({ lat: w.lat, lng: w.lng }));
  const allIndices = [originIdx, ...intermediates.map(i => i.index), destIdx];
  const matrix = await mapsClient.computeRouteMatrix(
    allIndices.map(i => coords[i]),
    allIndices.map(i => coords[i]),
    transportMode
  );

  const idxMap = new Map(allIndices.map((idx, i) => [idx, i]));

  let current = originIdx;
  while (unvisited.size > 0) {
    let nearest = -1;
    let nearestTime = Infinity;

    for (const candidate of unvisited) {
      const fromMapped = idxMap.get(current)!;
      const toMapped = idxMap.get(candidate)!;
      const duration = matrix.durations[fromMapped]?.[toMapped];
      if (duration !== null && duration !== undefined && duration < nearestTime) {
        nearestTime = duration;
        nearest = candidate;
      }
    }

    if (nearest === -1) break;
    order.push(nearest);
    unvisited.delete(nearest);
    current = nearest;
  }

  order.push(destIdx);

  return evaluateRoute(waypoints, order, transportMode);
}

/**
 * Evaluate a specific waypoint ordering by calling Compute Routes.
 */
async function evaluateRoute(
  waypoints: Waypoint[],
  order: number[],
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  const route = await mapsClient.computeRoute(
    { lat: waypoints[order[0]].lat, lng: waypoints[order[0]].lng },
    { lat: waypoints[order[order.length - 1]].lat, lng: waypoints[order[order.length - 1]].lng },
    transportMode
  );

  return {
    optimizedOrder: order,
    totalDurationSeconds: route.durationSeconds,
    totalDistanceMeters: route.distanceMeters,
    legs: route.steps.map((step, i) => ({
      fromIndex: order[i] ?? order[0],
      toIndex: order[i + 1] ?? order[order.length - 1],
      durationSeconds: parseInt(step.staticDuration?.replace('s', '') ?? '0', 10),
      distanceMeters: step.distanceMeters,
      polyline: step.polyline.encodedPolyline,
    })),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}
