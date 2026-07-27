import type { LatLng, TransportMode } from '@routebite/shared/types';
import { MAPS_FEATURES, riderTransportMode } from '@routebite/shared/constants';
import { haversineMeters } from '@routebite/shared/algorithms';
import { mapsClient } from '../maps/client';
import { GOOGLE_ROUTE_OPTIMIZATION_BASE } from '../maps/constants';

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
  /** Solver used */
  solver: 'routes_optimize_waypoint_order' | 'route_optimization_api' | 'greedy' | 'brute_force';
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
 * Optimize multi-stop routes for multi-intercept / multi-pickup orders.
 *
 * Priority:
 * 1. Routes API `optimizeWaypointOrder` (API-key friendly)
 * 2. Optional Cloud Route Optimization API (needs project + often OAuth)
 * 3. Local brute-force / greedy Matrix TSP fallback
 */
export async function optimizeMultiStopRoute(
  waypoints: Waypoint[],
  transportMode: TransportMode = riderTransportMode('food')
): Promise<OptimizedRoute> {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints required');
  }

  const originIdx = waypoints.findIndex((w) => w.type === 'origin');
  const destIdx = waypoints.findIndex((w) => w.type === 'destination');

  if (originIdx === -1 || destIdx === -1) {
    throw new Error('Origin and destination waypoints are required');
  }

  const intermediate = waypoints
    .map((w, i) => ({ ...w, index: i }))
    .filter((w) => w.type === 'pickup' || w.type === 'delivery');

  if (!MAPS_FEATURES.ROUTE_OPTIMIZATION || intermediate.length === 0) {
    return evaluateRoute(waypoints, [originIdx, destIdx], transportMode, 'greedy');
  }

  // 1) Native Routes optimizeWaypointOrder (must not use TRAFFIC_AWARE_OPTIMAL)
  try {
    return await optimizeWithRoutesApi(
      waypoints,
      originIdx,
      destIdx,
      intermediate,
      transportMode
    );
  } catch (err) {
    console.warn(
      '[route-optimization] Routes optimizeWaypointOrder failed:',
      err instanceof Error ? err.message : err
    );
  }

  // 2) Optional Cloud Route Optimization API
  if (MAPS_FEATURES.ROUTE_OPTIMIZATION_CLOUD_API) {
    try {
      return await optimizeWithCloudApi(waypoints, originIdx, destIdx, intermediate, transportMode);
    } catch (err) {
      console.warn(
        '[route-optimization] Cloud Route Optimization API failed:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // 3) Local solvers (matrix-scored — never N! full Routes calls)
  try {
    if (intermediate.length <= 7) {
      return await bruteForceOptimize(waypoints, originIdx, destIdx, intermediate, transportMode);
    }
    return await greedyOptimize(waypoints, originIdx, destIdx, intermediate, transportMode);
  } catch (err) {
    console.warn(
      '[route-optimization] Matrix local solver failed, using haversine greedy:',
      err instanceof Error ? err.message : err
    );
    return haversineGreedyOptimize(waypoints, originIdx, destIdx, intermediate);
  }
}

async function optimizeWithRoutesApi(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>,
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  const intermediateCoords = intermediates.map((w) => ({ lat: w.lat, lng: w.lng }));
  const route = await mapsClient.computeRoute(
    { lat: waypoints[originIdx].lat, lng: waypoints[originIdx].lng },
    { lat: waypoints[destIdx].lat, lng: waypoints[destIdx].lng },
    transportMode,
    {
      intermediates: intermediateCoords,
      optimizeWaypointOrder: intermediates.length >= 2,
      // Google rejects optimizeWaypointOrder with TRAFFIC_AWARE_OPTIMAL
      routingPreference: 'TRAFFIC_AWARE',
      extraComputations: false,
    }
  );

  const optimizedIntermediate =
    route.optimizedIntermediateWaypointIndex ?? intermediates.map((_, i) => i);

  const order = [
    originIdx,
    ...optimizedIntermediate.map((i) => intermediates[i]?.index).filter((i): i is number => i != null),
    destIdx,
  ];

  // Prefer full evaluation for accurate legs; fall back to aggregate route metrics
  try {
    const evaluated = await evaluateRoute(
      waypoints,
      order,
      transportMode,
      'routes_optimize_waypoint_order'
    );
    return evaluated;
  } catch {
    return {
      optimizedOrder: order,
      totalDurationSeconds: route.durationSeconds,
      totalDistanceMeters: route.distanceMeters,
      solver: 'routes_optimize_waypoint_order',
      legs: (route.steps ?? []).map((step, i) => ({
        fromIndex: order[i] ?? order[0],
        toIndex: order[i + 1] ?? order[order.length - 1],
        durationSeconds: parseInt(step.staticDuration?.replace('s', '') ?? '0', 10),
        distanceMeters: step.distanceMeters ?? 0,
        polyline: step.polyline?.encodedPolyline ?? route.encodedPolyline ?? '',
      })),
    };
  }
}

/**
 * Cloud Route Optimization API (optimizeTours).
 * Requires `GOOGLE_CLOUD_PROJECT` and a key/SA with routeoptimization access.
 * Scaffolded for multi-order / fleet; not required for single-traveler MVP.
 */
async function optimizeWithCloudApi(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>,
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (!project) {
    throw new Error('GOOGLE_CLOUD_PROJECT required for Cloud Route Optimization');
  }
  // Route Optimization requires OAuth/ADC — API keys return 401 (gmp-common-api-keys skill)
  const { getGoogleAccessToken } = await import('../maps/google-auth');
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    throw new Error(
      'Cloud Route Optimization requires Application Default Credentials (ADC)'
    );
  }

  const shipments = intermediates.map((w, i) => ({
    label: w.name ?? `stop-${i}`,
    pickups: [
      {
        arrivalLocation: { latitude: w.lat, longitude: w.lng },
        duration: `${Math.max(60, (w.dwellMinutes ?? 2) * 60)}s`,
      },
    ],
  }));

  const body = {
    model: {
      shipments,
      vehicles: [
        {
          label: 'routebite-rider',
          startLocation: {
            latitude: waypoints[originIdx].lat,
            longitude: waypoints[originIdx].lng,
          },
          endLocation: {
            latitude: waypoints[destIdx].lat,
            longitude: waypoints[destIdx].lng,
          },
          travelMode: transportMode === 'bike' ? 'TRAVEL_MODE_DRIVING' : 'TRAVEL_MODE_DRIVING',
        },
      ],
      globalStartTime: new Date().toISOString(),
      globalEndTime: new Date(Date.now() + 8 * 3600_000).toISOString(),
    },
  };

  const url = `${GOOGLE_ROUTE_OPTIMIZATION_BASE}/projects/${project}:optimizeTours`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Goog-User-Project': project,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Route Optimization API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    routes?: Array<{
      visits?: Array<{ shipmentIndex?: number }>;
      metrics?: { totalDuration?: string; travelDistanceMeters?: number };
    }>;
  };

  const visits = data.routes?.[0]?.visits ?? [];
  const order = [
    originIdx,
    ...visits
      .map((v) => {
        const idx = v.shipmentIndex;
        return idx != null ? intermediates[idx]?.index : undefined;
      })
      .filter((i): i is number => i != null),
    destIdx,
  ];

  return evaluateRoute(waypoints, order, transportMode, 'route_optimization_api');
}

async function bruteForceOptimize(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>,
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  // Score permutations with ONE matrix call — not computeRoute per perm (avoids 429).
  const allIndices = [originIdx, ...intermediates.map((i) => i.index), destIdx];
  const coords = allIndices.map((i) => ({ lat: waypoints[i].lat, lng: waypoints[i].lng }));
  const matrix = await mapsClient.computeRouteMatrix(coords, coords, transportMode);
  const idxMap = new Map(allIndices.map((idx, i) => [idx, i]));

  const tourCost = (order: number[]): number => {
    let total = 0;
    for (let i = 0; i < order.length - 1; i++) {
      const from = idxMap.get(order[i])!;
      const to = idxMap.get(order[i + 1])!;
      const d = matrix.durations[from]?.[to];
      if (d == null) {
        total += haversineMeters(waypoints[order[i]], waypoints[order[i + 1]]) / 8.5;
      } else {
        total += d;
      }
    }
    return total;
  };

  const perms = permutations(intermediates.map((i) => i.index));
  let bestOrder: number[] | undefined;
  let bestCost = Infinity;

  for (const perm of perms) {
    const order = [originIdx, ...perm, destIdx];
    const cost = tourCost(order);
    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = order;
    }
  }

  const order = bestOrder ?? [originIdx, ...intermediates.map((i) => i.index), destIdx];
  try {
    return await evaluateRoute(waypoints, order, transportMode, 'brute_force');
  } catch {
    return buildHaversineResult(waypoints, order, 'brute_force');
  }
}

async function greedyOptimize(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>,
  transportMode: TransportMode
): Promise<OptimizedRoute> {
  const unvisited = new Set(intermediates.map((i) => i.index));
  const order = [originIdx];

  const coords = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
  const allIndices = [originIdx, ...intermediates.map((i) => i.index), destIdx];
  const matrix = await mapsClient.computeRouteMatrix(
    allIndices.map((i) => coords[i]),
    allIndices.map((i) => coords[i]),
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
  try {
    return await evaluateRoute(waypoints, order, transportMode, 'greedy');
  } catch {
    return buildHaversineResult(waypoints, order, 'greedy');
  }
}

/** Offline fallback when Routes/Matrix are rate-limited or unavailable. */
function haversineGreedyOptimize(
  waypoints: Waypoint[],
  originIdx: number,
  destIdx: number,
  intermediates: Array<Waypoint & { index: number }>
): OptimizedRoute {
  const unvisited = new Set(intermediates.map((i) => i.index));
  const order = [originIdx];
  let current = originIdx;

  while (unvisited.size > 0) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (const candidate of unvisited) {
      const d = haversineMeters(waypoints[current], waypoints[candidate]);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = candidate;
      }
    }
    if (nearest === -1) break;
    order.push(nearest);
    unvisited.delete(nearest);
    current = nearest;
  }
  order.push(destIdx);
  return buildHaversineResult(waypoints, order, 'greedy');
}

function buildHaversineResult(
  waypoints: Waypoint[],
  order: number[],
  solver: OptimizedRoute['solver']
): OptimizedRoute {
  const legs = order.slice(0, -1).map((_, i) => {
    const from = waypoints[order[i]];
    const to = waypoints[order[i + 1]];
    const distanceMeters = Math.round(haversineMeters(from, to));
    // ~30 km/h urban average for ETA estimate when Routes unavailable
    const durationSeconds = Math.max(60, Math.round(distanceMeters / 8.5));
    return {
      fromIndex: order[i],
      toIndex: order[i + 1],
      durationSeconds,
      distanceMeters,
      polyline: '',
    };
  });

  return {
    optimizedOrder: order,
    totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
    totalDistanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
    solver,
    legs,
  };
}

async function evaluateRoute(
  waypoints: Waypoint[],
  order: number[],
  transportMode: TransportMode,
  solver: OptimizedRoute['solver']
): Promise<OptimizedRoute> {
  const intermediates = order.slice(1, -1).map((i) => ({
    lat: waypoints[i].lat,
    lng: waypoints[i].lng,
  }));

  const route = await mapsClient.computeRoute(
    { lat: waypoints[order[0]].lat, lng: waypoints[order[0]].lng },
    { lat: waypoints[order[order.length - 1]].lat, lng: waypoints[order[order.length - 1]].lng },
    transportMode,
    {
      intermediates: intermediates.length > 0 ? intermediates : undefined,
      extraComputations: false,
    }
  );

  const steps = route.steps ?? [];
  const legs =
    steps.length > 0
      ? steps.map((step, i) => ({
          fromIndex: order[i] ?? order[0],
          toIndex: order[i + 1] ?? order[order.length - 1],
          durationSeconds: parseInt(step.staticDuration?.replace('s', '') ?? '0', 10),
          distanceMeters: step.distanceMeters ?? 0,
          polyline: step.polyline?.encodedPolyline ?? route.encodedPolyline ?? '',
        }))
      : order.slice(0, -1).map((_, i) => ({
          fromIndex: order[i],
          toIndex: order[i + 1],
          durationSeconds: Math.round(route.durationSeconds / Math.max(order.length - 1, 1)),
          distanceMeters: Math.round(route.distanceMeters / Math.max(order.length - 1, 1)),
          polyline: route.encodedPolyline ?? '',
        }));

  return {
    optimizedOrder: order,
    totalDurationSeconds: route.durationSeconds,
    totalDistanceMeters: route.distanceMeters,
    solver,
    legs,
  };
}

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

/** Convenience: optimize restaurant → intercept → next stop chains for food riders. */
export async function optimizeRiderPickups(
  restaurantLocations: LatLng[],
  intercept: LatLng,
  opts?: { depot?: LatLng }
): Promise<OptimizedRoute> {
  const depot = opts?.depot ?? restaurantLocations[0];
  if (!depot || restaurantLocations.length === 0) {
    throw new Error('Need depot and at least one restaurant');
  }

  const waypoints: Waypoint[] = [
    { ...depot, type: 'origin', name: 'depot' },
    ...restaurantLocations.map((r, i) => ({
      ...r,
      type: 'pickup' as const,
      name: `restaurant-${i}`,
    })),
    { ...intercept, type: 'destination', name: 'intercept' },
  ];

  return optimizeMultiStopRoute(waypoints, riderTransportMode('food'));
}
