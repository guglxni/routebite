import { SwiggyMCPClient } from '../swiggy/client';
import { ensureSwiggyAddressId } from '../order/swiggy-address';
import { ensureInterceptReachability } from '../order/restaurant-rank';
import { mealPrimingForInterceptEta } from './meal-priming';
import type { InterceptReachability } from '@routebite/shared/types';

export type CoverageTier = 'rich' | 'ok' | 'thin' | 'none';

export interface CorridorCoverage {
  interceptId: string;
  lat: number;
  lng: number;
  addressId: string | null;
  food: {
    available: boolean;
    openCount: number;
    sampleNames: string[];
    tier: CoverageTier;
    swiggyDistanceKmAvg: number | null;
  };
  instamart: {
    available: boolean;
    productCount: number;
    sampleNames: string[];
    goToCount: number;
    tier: CoverageTier;
  };
  reachability: InterceptReachability | null;
  mealHint: ReturnType<typeof mealPrimingForInterceptEta>;
  probedAt: string;
}

function tierFromCount(n: number, richAt: number): CoverageTier {
  if (n <= 0) return 'none';
  if (n < 3) return 'thin';
  if (n < richAt) return 'ok';
  return 'rich';
}

function asList(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  for (const key of ['restaurants', 'products', 'items', 'results']) {
    if (Array.isArray(d[key])) return d[key] as Array<Record<string, unknown>>;
  }
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  return [];
}

/** Probe Swiggy Food + Instamart at an intercept address (corridor coverage). */
export async function probeCorridorCoverage(opts: {
  interceptId: string;
  lat: number;
  lng: number;
  dwellSeconds: number;
  etaSeconds?: number;
  restaurantCount?: number;
  reachability?: InterceptReachability | null;
  accessToken: string;
  userName?: string;
  userPhone?: string;
}): Promise<CorridorCoverage> {
  const client = new SwiggyMCPClient(opts.accessToken);
  const mealHint = mealPrimingForInterceptEta(
    opts.etaSeconds ?? opts.dwellSeconds,
    'food'
  );

  let addressId: string | null = null;
  try {
    const created = await ensureSwiggyAddressId(
      client,
      { lat: opts.lat, lng: opts.lng },
      {
        userName: opts.userName ?? 'RouteBite User',
        userPhone: opts.userPhone ?? '9999999999',
        landmark: `Intercept ${opts.interceptId}`,
      }
    );
    addressId = created.addressId;
  } catch {
    addressId = null;
  }

  const reachability = await ensureInterceptReachability(
    { lat: opts.lat, lng: opts.lng },
    opts.dwellSeconds,
    opts.restaurantCount,
    opts.reachability ?? null
  );

  let openCount = 0;
  let sampleFood: string[] = [];
  let distSum = 0;
  let distN = 0;

  if (addressId) {
    try {
      const res = await client.searchRestaurants({
        addressId,
        query: mealHint.primaryQuery,
      });
      const list = asList(res.data);
      for (const r of list) {
        const status = String(r.availabilityStatus ?? r.status ?? 'OPEN').toUpperCase();
        if (status === 'OPEN' || status === 'AVAILABLE') {
          openCount += 1;
          if (sampleFood.length < 4) {
            sampleFood.push(String(r.name ?? r.restaurantName ?? 'Restaurant'));
          }
        }
        const d = typeof r.distanceKm === 'number' ? r.distanceKm : null;
        if (d != null) {
          distSum += d;
          distN += 1;
        }
      }
    } catch {
      // soft fail
    }
  }

  let productCount = 0;
  let sampleIm: string[] = [];
  let goToCount = 0;
  if (addressId) {
    try {
      const res = await client.searchInstamartProducts({
        addressId,
        query: 'water',
      });
      const list = asList(res.data);
      productCount = list.length;
      sampleIm = list
        .slice(0, 4)
        .map((p) => String(p.name ?? p.productName ?? 'Item'));
    } catch {
      // soft
    }
    try {
      const go = await client.yourGoToItems({ addressId });
      goToCount = asList(go.data).length;
    } catch {
      // soft
    }
  }

  return {
    interceptId: opts.interceptId,
    lat: opts.lat,
    lng: opts.lng,
    addressId,
    food: {
      available: openCount > 0,
      openCount,
      sampleNames: sampleFood,
      tier: tierFromCount(openCount, 8),
      swiggyDistanceKmAvg: distN ? Math.round((distSum / distN) * 10) / 10 : null,
    },
    instamart: {
      available: productCount > 0,
      productCount,
      sampleNames: sampleIm,
      goToCount,
      tier: tierFromCount(productCount + goToCount, 10),
    },
    reachability,
    mealHint,
    probedAt: new Date().toISOString(),
  };
}
