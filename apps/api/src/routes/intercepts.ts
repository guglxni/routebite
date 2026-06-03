import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { intercepts, journeys } from '@routebite/db/schema';
import { SwiggyMCPClient } from '../services/swiggy/client';
import { RouteBiteError } from '../middleware/error-handler';
import { denyAccess } from '../lib/access-control';

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

// GET /api/v1/intercepts/:id/restaurants
app.get('/:id/restaurants', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');

  const point = await requireInterceptOwnership(id, user.id, c);

  const client = new SwiggyMCPClient(token);
  const res = await client.searchRestaurants({
    lat: point.lat,
    lng: point.lng,
  });

  if (!res.success) {
    throw new RouteBiteError('NETWORK_ERROR', res.error?.message ?? 'Failed to fetch restaurants', 502);
  }

  return c.json({
    success: true,
    data: {
      interceptId: id,
      restaurants: res.data?.restaurants ?? [],
    },
  });
});

// GET /api/v1/intercepts/:id/menu/:restaurantId
app.get('/:id/menu/:restaurantId', async (c) => {
  const id = c.req.param('id');
  const restaurantId = c.req.param('restaurantId');
  const token = c.get('accessToken');
  const user = c.get('user');

  await requireInterceptOwnership(id, user.id, c);

  const client = new SwiggyMCPClient(token);
  const res = await client.getMenu({ restaurantId });

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

  const point = await requireInterceptOwnership(id, user.id, c);

  const client = new SwiggyMCPClient(token);
  const res = await client.searchInstamartProducts({
    lat: point.lat,
    lng: point.lng,
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

export default app;
