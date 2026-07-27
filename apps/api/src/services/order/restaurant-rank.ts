import type { LatLng, InterceptReachability } from '@routebite/shared/types';
import { ISOCHRONE, MAPS_FEATURES, riderTransportMode } from '@routebite/shared/constants';
import { fallbackRiderTravel, rankRestaurantsByTravelTime } from './timing';
import {
  filterRestaurantsByIsochrone,
  isPointInsideRiderIsochrone,
} from '../maps/reachability';
import { mapsClient } from '../maps/client';
import { haversineMeters } from '../../lib/geo';

export interface RankableRestaurant {
  id: string;
  name?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  address?: string;
  [key: string]: unknown;
}

export interface RankedRestaurant extends RankableRestaurant {
  /** True when location is inside rider inbound isochrone. */
  insideRiderIsochrone?: boolean;
  /** Matrix rider ETA seconds (when coords available). */
  riderTravelSeconds?: number;
  /** Matrix distance meters. */
  riderDistanceMeters?: number;
  /** Heuristic from distanceKm when no coords. */
  estimatedTravelSeconds?: number;
  rankScore: number;
}

/**
 * Rank restaurants for an intercept using:
 * 1. Isochrone membership (hard preference)
 * 2. Route Matrix ETA when lat/lng present
 * 3. Swiggy distanceKm heuristic otherwise
 */
export async function rankRestaurantsForIntercept(
  restaurants: RankableRestaurant[],
  intercept: LatLng,
  reachability?: InterceptReachability | null
): Promise<RankedRestaurant[]> {
  if (restaurants.length === 0) return [];

  const withCoords = restaurants.filter(
    (r): r is RankableRestaurant & { lat: number; lng: number } =>
      typeof r.lat === 'number' && typeof r.lng === 'number'
  );

  // Geocode-less path: use distanceKm → travel estimate
  let matrixRanks: Array<{ index: number; durationSeconds: number; distanceMeters: number }> = [];
  if (withCoords.length > 0) {
    try {
      matrixRanks = await rankRestaurantsByTravelTime(
        withCoords.map((r) => ({ lat: r.lat, lng: r.lng })),
        intercept,
        riderTransportMode('food')
      );
    } catch {
      matrixRanks = [];
    }
  }

  const matrixById = new Map<string, { durationSeconds: number; distanceMeters: number }>();
  for (const row of matrixRanks) {
    const r = withCoords[row.index];
    if (r) matrixById.set(r.id, row);
  }

  const ranked: RankedRestaurant[] = restaurants.map((r) => {
    const loc =
      typeof r.lat === 'number' && typeof r.lng === 'number'
        ? { lat: r.lat, lng: r.lng }
        : undefined;

    let inside: boolean | undefined;
    if (loc && reachability?.riderIsochrone) {
      inside = isPointInsideRiderIsochrone(loc, reachability);
    } else if (typeof r.distanceKm === 'number' && reachability?.isochroneOk) {
      // Soft proxy: assume ~20 km/h bike → compare to budget
      const estS = (r.distanceKm / 20) * 3600;
      inside = estS <= (reachability.riderBudgetSeconds ?? ISOCHRONE.RIDER_MAX_BUDGET_S);
    }

    const matrix = matrixById.get(r.id);
    const estimatedTravelSeconds =
      matrix?.durationSeconds ??
      (typeof r.distanceKm === 'number'
        ? Math.round((r.distanceKm / 20) * 3600)
        : loc
          ? fallbackRiderTravel(haversineMeters(loc, intercept))
          : fallbackRiderTravel());

    // Rank: prefer inside isochrone, then lower travel time
    const insideBonus = inside === false ? -10_000 : inside === true ? 5_000 : 0;
    const rankScore = insideBonus - estimatedTravelSeconds;

    return {
      ...r,
      insideRiderIsochrone: inside,
      riderTravelSeconds: matrix?.durationSeconds,
      riderDistanceMeters: matrix?.distanceMeters,
      estimatedTravelSeconds,
      rankScore,
    };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore);

  if (
    MAPS_FEATURES.ISOCHRONES &&
    ISOCHRONE.ENFORCE_RESTAURANT_INSIDE &&
    reachability?.riderIsochrone
  ) {
    const insideOnly = ranked.filter((r) => r.insideRiderIsochrone !== false);
    // Keep outside options at the end if everything fails the filter
    if (insideOnly.length > 0) {
      const outside = ranked.filter((r) => r.insideRiderIsochrone === false);
      return [...insideOnly, ...outside];
    }
  }

  return ranked;
}

/** Lazy-load / refresh reachability for an intercept if missing. */
export async function ensureInterceptReachability(
  intercept: LatLng,
  dwellSeconds: number,
  circularCount?: number,
  existing?: InterceptReachability | null
): Promise<InterceptReachability | null> {
  if (existing?.riderIsochrone && existing.isochroneOk) return existing;
  if (!MAPS_FEATURES.ISOCHRONES) return existing ?? null;
  try {
    return await mapsClient.buildInterceptReachability({
      intercept,
      dwellSeconds,
      circularRestaurantCount: circularCount,
    });
  } catch {
    return existing ?? null;
  }
}

export { filterRestaurantsByIsochrone };
