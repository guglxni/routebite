import type { LatLng, InterceptReachability, IsochroneGeometry } from '@routebite/shared/types';
import {
  ISOCHRONE,
  MAPS_CONFIG,
  MAPS_FEATURES,
  TIMING,
} from '@routebite/shared/constants';
import {
  approxPolygonAreaM2,
  boundingRadiusMeters,
  countPointsInGeoJson,
  geoJsonBoundingBox,
  pointInGeoJson,
  type GeoJsonPolygonGeometry,
} from '@routebite/shared/algorithms';
import { IsochronesClient, computeRiderBudgetSeconds } from './isochrones';
import { PlacesInsightsClient } from './places';

export interface ReachabilityInput {
  intercept: LatLng;
  dwellSeconds: number;
  /** Circular Places count already computed for this intercept. */
  circularRestaurantCount?: number;
  /** Prefer traffic-aware drive isochrone for car journeys (outbound viz only). */
  preferDriveTraffic?: boolean;
}

export interface RestaurantCandidate {
  id: string;
  name?: string;
  lat: number;
  lng: number;
}

/**
 * Build dual-sided reachability for an intercept:
 * - Rider inbound (TO + BICYCLE): restaurants that can reach the pin in budget
 * - Walk FROM: customer handoff footprint
 */
export async function buildInterceptReachability(
  input: ReachabilityInput,
  isochrones: IsochronesClient,
  places: PlacesInsightsClient
): Promise<InterceptReachability> {
  const riderBudget = computeRiderBudgetSeconds(input.dwellSeconds, {
    safetyBufferS: TIMING.SAFETY_BUFFER_S,
    trafficBufferS: TIMING.TRAFFIC_BUFFER_S,
  });
  const walkBudget = ISOCHRONE.WALK_BUDGET_S;

  let riderGeom: GeoJsonPolygonGeometry | undefined;
  let walkGeom: GeoJsonPolygonGeometry | undefined;
  let isochroneOk = false;

  try {
    const rider = await isochrones.generate({
      location: input.intercept,
      travelDurationSeconds: riderBudget,
      travelMode: ISOCHRONE.RIDER_MODE,
      travelDirection: 'TO',
      enableSmoothing: false,
      polygonFidelity: 'MEDIUM',
      simplify: true,
    });
    riderGeom = rider.geometry;
    isochroneOk = true;
  } catch (err) {
    console.warn(
      '[reachability] rider isochrone failed:',
      err instanceof Error ? err.message : err
    );
  }

  try {
    const walk = await isochrones.generate({
      location: input.intercept,
      travelDurationSeconds: walkBudget,
      travelMode: ISOCHRONE.WALK_MODE,
      travelDirection: 'FROM',
      enableSmoothing: MAPS_FEATURES.ISOCHRONE_UI_POLYGONS,
      polygonFidelity: 'MEDIUM',
      simplify: true,
    });
    walkGeom = walk.geometry;
    isochroneOk = isochroneOk || true;
  } catch (err) {
    console.warn(
      '[reachability] walk isochrone failed:',
      err instanceof Error ? err.message : err
    );
  }

  let reachableRestaurantCount = 0;
  let riderAreaM2: number | undefined;

  if (riderGeom) {
    riderAreaM2 = Math.round(approxPolygonAreaM2(riderGeom));

    if (MAPS_FEATURES.ISOCHRONE_RESTAURANT_PIP) {
      try {
        const locations = await places.listRestaurantLocationsNear(
          input.intercept,
          searchRadiusForIsochrone(input.intercept, riderGeom)
        );
        reachableRestaurantCount = countPointsInGeoJson(locations, riderGeom);
      } catch (err) {
        console.warn(
          '[reachability] PIP restaurant search failed:',
          err instanceof Error ? err.message : err
        );
        reachableRestaurantCount = estimateReachableFromArea(
          input.circularRestaurantCount ?? 0,
          riderAreaM2
        );
      }
    } else {
      reachableRestaurantCount = estimateReachableFromArea(
        input.circularRestaurantCount ?? 0,
        riderAreaM2
      );
    }
  } else {
    reachableRestaurantCount = input.circularRestaurantCount ?? 0;
  }

  const result: InterceptReachability = {
    riderBudgetSeconds: riderBudget,
    walkBudgetSeconds: walkBudget,
    reachableRestaurantCount,
    circularRestaurantCount: input.circularRestaurantCount,
    riderAreaM2,
    isochroneOk,
    travelMode: ISOCHRONE.RIDER_MODE,
    travelDirection: 'TO',
  };

  if (MAPS_FEATURES.ISOCHRONE_UI_POLYGONS) {
    if (riderGeom) result.riderIsochrone = riderGeom as IsochroneGeometry;
    if (walkGeom) result.walkIsochrone = walkGeom as IsochroneGeometry;
  }

  return result;
}

/** Batch reachability for ranked intercepts (capped for cost). */
export async function attachReachabilityToPoints<
  T extends LatLng & { dwellTime: number; restaurantCount?: number },
>(
  points: T[],
  isochrones: IsochronesClient,
  places: PlacesInsightsClient,
  maxPoints: number = MAPS_CONFIG.ISOCHRONE_MAX_PER_ANALYZE
): Promise<Array<T & { reachability: InterceptReachability; reachableRestaurantCount: number }>> {
  if (!MAPS_FEATURES.ISOCHRONES || points.length === 0) {
    return points.map((p) => ({
      ...p,
      reachableRestaurantCount: p.restaurantCount ?? 0,
      reachability: {
        riderBudgetSeconds: ISOCHRONE.RIDER_MIN_BUDGET_S,
        walkBudgetSeconds: ISOCHRONE.WALK_BUDGET_S,
        reachableRestaurantCount: p.restaurantCount ?? 0,
        circularRestaurantCount: p.restaurantCount,
        isochroneOk: false,
      },
    }));
  }

  const slice = points.slice(0, maxPoints);
  const rest = points.slice(maxPoints);

  const enriched = await Promise.all(
    slice.map(async (p) => {
      const reachability = await buildInterceptReachability(
        {
          intercept: { lat: p.lat, lng: p.lng },
          dwellSeconds: p.dwellTime,
          circularRestaurantCount: p.restaurantCount,
        },
        isochrones,
        places
      );
      return {
        ...p,
        reachableRestaurantCount: reachability.reachableRestaurantCount,
        reachability,
      };
    })
  );

  const restMapped = rest.map((p) => ({
    ...p,
    reachableRestaurantCount: p.restaurantCount ?? 0,
    reachability: {
      riderBudgetSeconds: computeRiderBudgetSeconds(p.dwellTime),
      walkBudgetSeconds: ISOCHRONE.WALK_BUDGET_S,
      reachableRestaurantCount: p.restaurantCount ?? 0,
      circularRestaurantCount: p.restaurantCount,
      isochroneOk: false,
    } satisfies InterceptReachability,
  }));

  return [...enriched, ...restMapped];
}

export function isPointInsideRiderIsochrone(
  point: LatLng,
  reachability?: InterceptReachability | null
): boolean | undefined {
  if (!reachability?.riderIsochrone) return undefined;
  return pointInGeoJson(point, reachability.riderIsochrone as GeoJsonPolygonGeometry);
}

export function filterRestaurantsByIsochrone<T extends RestaurantCandidate>(
  restaurants: T[],
  reachability?: InterceptReachability | null
): T[] {
  if (!reachability?.riderIsochrone) return restaurants;
  const geom = reachability.riderIsochrone as GeoJsonPolygonGeometry;
  return restaurants.filter((r) => pointInGeoJson({ lat: r.lat, lng: r.lng }, geom));
}

function searchRadiusForIsochrone(
  center: LatLng,
  geometry: GeoJsonPolygonGeometry
): number {
  const bbox = geoJsonBoundingBox(geometry);
  if (!bbox) return MAPS_CONFIG.PLACES_AGGREGATE_RADIUS_M * 4;
  return Math.min(15_000, Math.max(800, boundingRadiusMeters(center, bbox)));
}

/** Scale circular count by area ratio vs 500m disk when PIP unavailable. */
function estimateReachableFromArea(circularCount: number, areaM2: number): number {
  const circleArea = Math.PI * MAPS_CONFIG.PLACES_AGGREGATE_RADIUS_M ** 2;
  if (areaM2 <= 0 || circularCount <= 0) return 0;
  const ratio = Math.min(2.5, areaM2 / circleArea);
  return Math.max(0, Math.round(circularCount * Math.min(1, ratio * 0.65)));
}
