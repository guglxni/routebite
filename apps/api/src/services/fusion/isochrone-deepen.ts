import type { LatLng, InterceptReachability } from '@routebite/shared/types';
import { ISOCHRONE } from '@routebite/shared/constants';
import { mapsClient } from '../maps/client';
import { ensureInterceptReachability } from '../order/restaurant-rank';

/**
 * Deepen (shrink) rider isochrone as customer approaches the intercept.
 * customerEtaSeconds becomes the new dwell/budget ceiling.
 */
export async function deepenIsochroneForApproach(opts: {
  intercept: LatLng;
  baseDwellSeconds: number;
  customerEtaSeconds: number;
  restaurantCount?: number;
  existing?: InterceptReachability | null;
}): Promise<{
  reachability: InterceptReachability | null;
  riderBudgetSeconds: number;
  shrunk: boolean;
  note: string;
}> {
  const budget = Math.max(
    90,
    Math.min(opts.baseDwellSeconds, opts.customerEtaSeconds, ISOCHRONE.RIDER_MAX_BUDGET_S)
  );
  const shrunk = budget < opts.baseDwellSeconds - 30;

  let reachability = opts.existing ?? null;
  if (shrunk || !reachability?.riderIsochrone) {
    try {
      reachability = await mapsClient.buildInterceptReachability({
        intercept: opts.intercept,
        dwellSeconds: budget,
        circularRestaurantCount: opts.restaurantCount,
      });
    } catch {
      reachability = await ensureInterceptReachability(
        opts.intercept,
        budget,
        opts.restaurantCount,
        opts.existing
      );
    }
  }

  return {
    reachability,
    riderBudgetSeconds: reachability?.riderBudgetSeconds ?? budget,
    shrunk,
    note: shrunk
      ? `Zone tightened to ~${Math.round(budget / 60)} min as you approach (was ~${Math.round(opts.baseDwellSeconds / 60)} min halt).`
      : `Rider zone ~${Math.round(budget / 60)} min based on halt window.`,
  };
}

export function honestyDistance(opts: {
  swiggyDistanceKm?: number | null;
  mapsDistanceMeters?: number | null;
  mapsTravelSeconds?: number | null;
}): {
  swiggyDistanceKm: number | null;
  mapsDistanceKm: number | null;
  mapsTravelMinutes: number | null;
  deltaKm: number | null;
  note: string;
} {
  const swiggy = opts.swiggyDistanceKm ?? null;
  const mapsKm =
    opts.mapsDistanceMeters != null
      ? Math.round((opts.mapsDistanceMeters / 1000) * 10) / 10
      : null;
  const mapsMin =
    opts.mapsTravelSeconds != null ? Math.round(opts.mapsTravelSeconds / 60) : null;
  const delta =
    swiggy != null && mapsKm != null ? Math.round((mapsKm - swiggy) * 10) / 10 : null;

  let note = 'Swiggy ranks by catalog distance; Maps Matrix is the rider→stop truth.';
  if (swiggy != null && mapsMin != null) {
    note = `Swiggy ${swiggy} km · Maps bike ~${mapsMin} min${mapsKm != null ? ` (${mapsKm} km)` : ''}`;
  } else if (swiggy != null) {
    note = `Swiggy ${swiggy} km (matrix ETA unavailable)`;
  } else if (mapsMin != null) {
    note = `Maps bike ~${mapsMin} min to intercept`;
  }

  return {
    swiggyDistanceKm: swiggy,
    mapsDistanceKm: mapsKm,
    mapsTravelMinutes: mapsMin,
    deltaKm: delta,
    note,
  };
}
