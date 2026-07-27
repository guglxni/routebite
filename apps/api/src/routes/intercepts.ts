import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { intercepts, journeys } from '@routebite/db/schema';
import type { InterceptReachability } from '@routebite/shared/types';
import { SwiggyMCPClient } from '../services/swiggy/client';
import { RouteBiteError } from '../middleware/error-handler';
import { denyAccess } from '../lib/access-control';
import {
  ensureInterceptReachability,
  rankRestaurantsForIntercept,
  type RankableRestaurant,
} from '../services/order/restaurant-rank';
import { ensureSwiggyAddressId } from '../services/order/swiggy-address';
import { probeCorridorCoverage } from '../services/fusion/corridor-coverage';
import { mealPrimingForInterceptEta } from '../services/fusion/meal-priming';
import { evaluateHaltGate } from '../services/fusion/halt-gate';
import { suggestReIntercept } from '../services/fusion/re-intercept';
import {
  deepenIsochroneForApproach,
  honestyDistance,
} from '../services/fusion/isochrone-deepen';

const app = new Hono();

/**
 * Verify the authenticated user owns the journey that contains this intercept.
 * Returns the intercept row if authorized, throws 404 to prevent IDOR probing.
 */
async function requireInterceptOwnership(interceptId: string, userId: number, c: Context) {
  const db = getDb();
  const point = await db
    .select()
    .from(intercepts)
    .where(eq(intercepts.id, interceptId))
    .get();

  if (!point) {
    denyAccess(c, { resource: 'intercept', resourceId: interceptId });
  }

  const journey = await db
    .select()
    .from(journeys)
    .where(eq(journeys.id, point.journeyId))
    .get();

  if (!journey || journey.userId !== userId) {
    denyAccess(c, {
      resource: 'intercept',
      resourceId: interceptId,
      ownerUserId: journey?.userId ?? undefined,
    });
  }

  return point;
}

function parseReachability(json: string | null | undefined): InterceptReachability | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as InterceptReachability;
  } catch {
    return null;
  }
}

// GET /api/v1/intercepts/:id/reachability
app.get('/:id/reachability', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const point = await requireInterceptOwnership(id, user.id, c);

  let reachability = parseReachability(point.reachabilityJson);
  reachability = await ensureInterceptReachability(
    { lat: point.lat, lng: point.lng },
    point.estimatedDwellTime ?? 300,
    point.restaurantCount ?? undefined,
    reachability
  );

  // Persist refreshed payload when we generated fresh isochrones
  if (reachability?.isochroneOk && !point.reachabilityJson) {
    const db = getDb();
    await db
      .update(intercepts)
      .set({
        reachabilityJson: JSON.stringify(reachability),
        reachableRestaurantCount: reachability.reachableRestaurantCount,
      })
      .where(eq(intercepts.id, id));
  }

  return c.json({
    success: true,
    data: {
      interceptId: id,
      lat: point.lat,
      lng: point.lng,
      reachability,
    },
  });
});

// GET /api/v1/intercepts/:id/restaurants
app.get('/:id/restaurants', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');

  const point = await requireInterceptOwnership(id, user.id, c);

  const client = new SwiggyMCPClient(token);
  const query = c.req.query('q') ?? 'food';

  let addressId: string;
  try {
    const ensured = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      {
        userName: user.name ?? 'RouteBite User',
        userPhone: '9999999999',
      }
    );
    addressId = ensured.addressId;
  } catch (err) {
    throw new RouteBiteError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Failed to resolve delivery address',
      502
    );
  }

  const res = await client.searchRestaurants({
    addressId,
    query,
  });

  if (!res.success) {
    throw new RouteBiteError('NETWORK_ERROR', res.error?.message ?? 'Failed to fetch restaurants', 502);
  }

  const raw = ((res.data?.restaurants ?? []) as RankableRestaurant[]).filter((r) => {
    const status = (r as { availabilityStatus?: string }).availabilityStatus;
    return !status || status === 'OPEN';
  });
  let reachability = parseReachability(point.reachabilityJson);

  const customerEtaParam = c.req.query('customerEta');
  const customerEtaSeconds = customerEtaParam
    ? Math.max(60, parseInt(customerEtaParam, 10) || 0)
    : null;

  let deepenNote: string | null = null;
  let shrunk = false;
  if (customerEtaSeconds != null) {
    const deep = await deepenIsochroneForApproach({
      intercept: { lat: point.lat, lng: point.lng },
      baseDwellSeconds: point.estimatedDwellTime ?? 300,
      customerEtaSeconds,
      restaurantCount: point.restaurantCount ?? undefined,
      existing: reachability,
    });
    reachability = deep.reachability;
    deepenNote = deep.note;
    shrunk = deep.shrunk;
  } else {
    reachability = await ensureInterceptReachability(
      { lat: point.lat, lng: point.lng },
      point.estimatedDwellTime ?? 300,
      point.restaurantCount ?? undefined,
      reachability
    );
  }

  const restaurants = (
    await rankRestaurantsForIntercept(
      raw,
      { lat: point.lat, lng: point.lng },
      reachability
    )
  ).map((r) => {
    const honesty = honestyDistance({
      swiggyDistanceKm: typeof r.distanceKm === 'number' ? r.distanceKm : null,
      mapsDistanceMeters: r.riderDistanceMeters,
      mapsTravelSeconds: r.riderTravelSeconds ?? r.estimatedTravelSeconds,
    });
    return { ...r, honesty };
  });

  const mealHint = mealPrimingForInterceptEta(
    customerEtaSeconds ?? point.estimatedDwellTime ?? 600,
    'food'
  );

  return c.json({
    success: true,
    data: {
      interceptId: id,
      restaurants,
      mealHint,
      deepen: deepenNote
        ? { shrunk, note: deepenNote, customerEtaSeconds }
        : null,
      reachability: reachability
        ? {
            riderBudgetSeconds: reachability.riderBudgetSeconds,
            walkBudgetSeconds: reachability.walkBudgetSeconds,
            reachableRestaurantCount: reachability.reachableRestaurantCount,
            isochroneOk: reachability.isochroneOk,
            riderIsochrone: reachability.riderIsochrone,
            walkIsochrone: reachability.walkIsochrone,
          }
        : undefined,
    },
  });
});

// GET /api/v1/intercepts/:id/menu/:restaurantId
app.get('/:id/menu/:restaurantId', async (c) => {
  const id = c.req.param('id');
  const restaurantId = c.req.param('restaurantId');
  const token = c.get('accessToken');
  const user = c.get('user');

  const point = await requireInterceptOwnership(id, user.id, c);
  const client = new SwiggyMCPClient(token);

  let addressId: string;
  try {
    const ensured = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      { userName: user.name ?? 'RouteBite User', userPhone: '9999999999' }
    );
    addressId = ensured.addressId;
  } catch (err) {
    throw new RouteBiteError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Failed to resolve delivery address',
      502
    );
  }

  const res = await client.getMenu({ addressId, restaurantId });

  if (!res.success) {
    throw new RouteBiteError('NETWORK_ERROR', res.error?.message ?? 'Failed to fetch menu', 502);
  }

  return c.json({
    success: true,
    data: {
      interceptId: id,
      restaurantId,
      items: res.data?.items ?? [],
      categories: res.data?.categories ?? [],
    },
  });
});

// GET /api/v1/intercepts/:id/products
app.get('/:id/products', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');
  const query = c.req.query('q') ?? 'grocery';

  const point = await requireInterceptOwnership(id, user.id, c);
  const client = new SwiggyMCPClient(token);

  let addressId: string;
  try {
    const ensured = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      { userName: user.name ?? 'RouteBite User', userPhone: '9999999999' }
    );
    addressId = ensured.addressId;
  } catch (err) {
    throw new RouteBiteError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Failed to resolve delivery address',
      502
    );
  }

  const res = await client.searchInstamartProducts({
    addressId,
    query,
  });

  if (!res.success) {
    throw new RouteBiteError('NETWORK_ERROR', res.error?.message ?? 'Failed to fetch products', 502);
  }

  return c.json({
    success: true,
    data: {
      interceptId: id,
      products: res.data?.products ?? [],
    },
  });
});

// GET /api/v1/intercepts/:id/menu-search?q=&restaurantId=
app.get('/:id/menu-search', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');
  const query = c.req.query('q');
  const restaurantId = c.req.query('restaurantId') ?? undefined;

  if (!query?.trim()) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Query q is required', 400);
  }

  const point = await requireInterceptOwnership(id, user.id, c);
  const client = new SwiggyMCPClient(token);

  let addressId: string;
  try {
    const ensured = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      { userName: user.name ?? 'RouteBite User', userPhone: '9999999999' }
    );
    addressId = ensured.addressId;
  } catch (err) {
    throw new RouteBiteError(
      'SWIGGY_REAUTH_REQUIRED',
      err instanceof Error ? err.message : 'Failed to resolve delivery address',
      401
    );
  }

  const res = await client.searchMenu({
    addressId,
    query: query.trim(),
    ...(restaurantId ? { restaurantIdOfAddedItem: restaurantId } : {}),
  });

  if (!res.success) {
    throw new RouteBiteError('NETWORK_ERROR', res.error?.message ?? 'Menu search failed', 502);
  }

  const data = res.data as { items?: unknown[]; total?: number } | unknown[];
  const items = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? [];

  return c.json({
    success: true,
    data: {
      interceptId: id,
      query,
      restaurantId: restaurantId ?? null,
      items,
      total: Array.isArray(data) ? data.length : (data as { total?: number })?.total ?? items.length,
    },
  });
});

// GET /api/v1/intercepts/:id/go-to — Instamart your_go_to_items
app.get('/:id/go-to', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');
  const point = await requireInterceptOwnership(id, user.id, c);
  const client = new SwiggyMCPClient(token);

  let addressId: string;
  try {
    const ensured = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      { userName: user.name ?? 'RouteBite User', userPhone: '9999999999' }
    );
    addressId = ensured.addressId;
  } catch (err) {
    throw new RouteBiteError(
      'SWIGGY_REAUTH_REQUIRED',
      err instanceof Error ? err.message : 'Failed to resolve delivery address',
      401
    );
  }

  const res = await client.yourGoToItems({ addressId });
  if (!res.success) {
    throw new RouteBiteError('NETWORK_ERROR', res.error?.message ?? 'your_go_to_items failed', 502);
  }

  const data = res.data as { products?: unknown[] } | unknown[];
  const products = Array.isArray(data) ? data : (data as { products?: unknown[] })?.products ?? [];

  return c.json({
    success: true,
    data: { interceptId: id, addressId, products },
  });
});

// GET /api/v1/intercepts/:id/coverage — Food + Instamart corridor probe
app.get('/:id/coverage', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');
  const point = await requireInterceptOwnership(id, user.id, c);
  const journey = await getDb()
    .select()
    .from(journeys)
    .where(eq(journeys.id, point.journeyId))
    .get();

  const etaSeconds = point.estimatedDwellTime ?? journey?.estimatedDuration ?? 600;
  const coverage = await probeCorridorCoverage({
    interceptId: id,
    lat: point.lat,
    lng: point.lng,
    dwellSeconds: point.estimatedDwellTime ?? 300,
    etaSeconds,
    restaurantCount: point.restaurantCount ?? undefined,
    reachability: parseReachability(point.reachabilityJson),
    accessToken: token,
    userName: user.name ?? undefined,
  });

  return c.json({ success: true, data: coverage });
});

// GET /api/v1/intercepts/:id/meal-hint
app.get('/:id/meal-hint', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const server = (c.req.query('server') === 'instamart' ? 'instamart' : 'food') as
    | 'food'
    | 'instamart';
  const point = await requireInterceptOwnership(id, user.id, c);
  const hint = mealPrimingForInterceptEta(
    point.estimatedDwellTime ?? 600,
    server
  );
  return c.json({ success: true, data: { interceptId: id, ...hint } });
});

// GET /api/v1/intercepts/:id/halt-gate?prep=&riderTravel=
app.get('/:id/halt-gate', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const point = await requireInterceptOwnership(id, user.id, c);
  const journey = await getDb()
    .select()
    .from(journeys)
    .where(eq(journeys.id, point.journeyId))
    .get();
  const prep = Math.max(60, parseInt(c.req.query('prep') ?? '900', 10) || 900);
  const riderTravel = Math.max(60, parseInt(c.req.query('riderTravel') ?? '600', 10) || 600);
  const gate = evaluateHaltGate({
    dwellSeconds: point.estimatedDwellTime ?? 300,
    prepSeconds: prep,
    riderTravelSeconds: riderTravel,
    transportMode: journey?.transportMode,
  });
  return c.json({
    success: true,
    data: { interceptId: id, transportMode: journey?.transportMode ?? null, ...gate },
  });
});

// GET /api/v1/intercepts/:id/re-intercept?alignment=&outside=
app.get('/:id/re-intercept', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const point = await requireInterceptOwnership(id, user.id, c);
  const siblings = await getDb()
    .select()
    .from(intercepts)
    .where(eq(intercepts.journeyId, point.journeyId))
    .all();
  const alignment = c.req.query('alignment') as
    | 'excellent'
    | 'good'
    | 'fair'
    | 'poor'
    | undefined;
  const outside = c.req.query('outside') === '1' || c.req.query('outside') === 'true';
  const suggestion = suggestReIntercept({
    currentInterceptId: id,
    alignmentLevel: alignment,
    riderOutsideIsochrone: outside,
    candidates: siblings.map((s) => ({
      id: s.id,
      name: s.name,
      score: s.score,
      estimatedDwellTime: s.estimatedDwellTime,
      restaurantCount: s.restaurantCount,
      reachableRestaurantCount: s.reachableRestaurantCount,
    })),
  });
  return c.json({ success: true, data: suggestion });
});

export default app;
