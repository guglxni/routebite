import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, trackingEvents, intercepts } from '@routebite/db/schema';
import { placeOrder } from '../services/order/placement';
import { SwiggyMCPClient } from '../services/swiggy/client';
import { startPolling } from '../services/tracking/poller';
import { loadCustomerContextForOrder } from '../services/tracking/customer-context';
import { RouteBiteError } from '../middleware/error-handler';
import { denyAccess } from '../lib/access-control';
import { buildDualClock } from '../services/fusion/dual-clock';
import { suggestReIntercept } from '../services/fusion/re-intercept';
import { planHopPacking } from '../services/fusion/hop-packing';

const app = new Hono();

const PlaceOrderSchema = z.object({
  journeyId: z.string().min(1),
  interceptId: z.string().min(1),
  server: z.enum(['food', 'instamart']),
  timing: z.enum(['now', 'auto']),
  restaurantId: z.string().optional(),
  foodItems: z.array(z.object({
    menuItemId: z.string(),
    variantId: z.string().optional(),
    addonIds: z.array(z.string()),
    quantity: z.number().int().positive(),
  })).optional(),
  productItems: z.array(z.object({
    productId: z.string(),
    variantId: z.string(),
    quantity: z.number().int().positive(),
  })).optional(),
  paymentMethod: z.string().optional(),
  couponCode: z.string().optional(),
});

/**
 * Verify the authenticated user owns the requested order.
 * Returns the order row if authorized, throws 404 (not 403) to prevent IDOR probing.
 */
async function requireOrderOwnership(
  orderId: string,
  userId: number,
  c: Context
) {
  const db = getDb();
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) {
    denyAccess(c, { resource: 'order', resourceId: orderId });
  }
  if (order.userId !== userId) {
    denyAccess(c, { resource: 'order', resourceId: orderId, ownerUserId: order.userId });
  }
  return order;
}

// POST /api/v1/orders
app.post('/', zValidator('json', PlaceOrderSchema), async (c) => {
  const data = c.req.valid('json');
  const token = c.get('accessToken');
  const user = c.get('user');

  // Inject userId so placement service can scope the order
  const result = await placeOrder({ ...data, userId: user.id }, token);

  // If placed immediately with a swiggyOrderId, start background polling
  if (result.swiggyOrderId) {
    startPolling(result.orderId, result.swiggyOrderId, data.server, token);
  }

  return c.json({ success: true, data: result });
});

// GET /api/v1/orders
app.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();
  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .all();

  return c.json({ success: true, data: userOrders });
});

// GET /api/v1/orders/:id
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const order = await requireOrderOwnership(id, user.id, c);
  return c.json({ success: true, data: order });
});

// GET /api/v1/orders/:id/track — live snapshot + start poller
app.get('/:id/track', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');

  const order = await requireOrderOwnership(id, user.id, c);

  if (!order.swiggyOrderId) {
    let haltGate = null;
    try {
      haltGate = order.haltGateJson ? JSON.parse(order.haltGateJson) : null;
    } catch {
      haltGate = null;
    }
    return c.json({
      success: true,
      data: {
        orderId: id,
        status: order.status,
        swiggyOrderId: null,
        tracking: null,
        deferred: {
          timingType: order.timingType,
          autoPlaceAt: order.autoPlaceAt?.toISOString?.() ?? order.autoPlaceAt ?? null,
          placeAttempts: order.placeAttempts ?? 0,
          lastPlaceError: order.lastPlaceError ?? null,
          mealQueryHint: order.mealQueryHint ?? null,
          haltGate,
        },
      },
    });
  }

  // Ensure polling is running
  startPolling(id, order.swiggyOrderId, order.server as 'food' | 'instamart', token);

  const client = new SwiggyMCPClient(token);
  let dropLat = 12.9716;
  let dropLng = 77.5946;
  if (order.interceptId) {
    const point = await getDb()
      .select()
      .from(intercepts)
      .where(eq(intercepts.id, order.interceptId))
      .get();
    if (point) {
      dropLat = point.lat;
      dropLng = point.lng;
    }
  }

  const trackRes =
    order.server === 'food'
      ? await client.trackFoodOrder({ orderId: order.swiggyOrderId })
      : await client.trackInstamartOrder({
          orderId: order.swiggyOrderId,
          lat: dropLat,
          lng: dropLng,
        });

  if (!trackRes.success) {
    throw new RouteBiteError('SWIGGY_ERROR', trackRes.error?.message ?? 'Tracking failed', 502);
  }

  const raw = trackRes.data as Record<string, unknown>;

  // Normalize fields
  const riderLoc = (raw.rider_location ?? raw.riderPosition ?? raw.rider_position ?? raw.currentLocation) as Record<string, number> | undefined;
  const riderLat = riderLoc?.lat ?? riderLoc?.latitude;
  const riderLng = riderLoc?.lng ?? riderLoc?.longitude;
  const swiggyCustomerETA = (raw.customer_eta ?? raw.customerETA ?? raw.estimated_delivery_time_seconds) as number | undefined;
  const riderETA = (raw.rider_eta ?? raw.riderETA) as number | undefined;

  const customerContext = await loadCustomerContextForOrder(id);
  const customerETA = customerContext?.customerETA ?? swiggyCustomerETA;

  const dualClock = await buildDualClock({
    customerETA,
    riderETA,
    orderStatus: order.status,
    customerPosition: customerContext?.customerPosition ?? null,
    riderPosition:
      riderLat !== undefined && riderLng !== undefined
        ? { lat: riderLat, lng: riderLng }
        : null,
    intercept: { lat: dropLat, lng: dropLng },
    swiggyDistanceKm:
      typeof raw.distanceKm === 'number' ? (raw.distanceKm as number) : null,
  });

  let reIntercept = null;
  if (order.journeyId && order.interceptId) {
    const siblings = await getDb()
      .select()
      .from(intercepts)
      .where(eq(intercepts.journeyId, order.journeyId))
      .all();
    reIntercept = suggestReIntercept({
      currentInterceptId: order.interceptId,
      alignmentLevel: dualClock.alignment?.status,
      riderOutsideIsochrone: dualClock.alignment?.riderOutsideIsochrone,
      candidates: siblings.map((s) => ({
        id: s.id,
        name: s.name,
        score: s.score,
        estimatedDwellTime: s.estimatedDwellTime,
        restaurantCount: s.restaurantCount,
        reachableRestaurantCount: s.reachableRestaurantCount,
      })),
    });
  }

  const deliveryInstructions =
    (raw.delivery_instructions ?? raw.deliveryInstructions) as string | undefined;

  return c.json({
    success: true,
    data: {
      orderId: id,
      status: order.status,
      swiggyOrderId: order.swiggyOrderId,
      customerETA: dualClock.customerETA,
      riderETA: dualClock.riderETA,
      riderPosition:
        riderLat !== undefined && riderLng !== undefined
          ? { lat: riderLat, lng: riderLng }
          : undefined,
      customerContext: customerContext
        ? {
            ...customerContext,
            riderBrief: deliveryInstructions ?? customerContext.riderBrief,
          }
        : null,
      alignmentStatus: dualClock.alignment,
      dualClock,
      reIntercept,
      ...(process.env.NODE_ENV !== 'production' ? { raw } : {}),
    },
  });
});

const HopPackSchema = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      priceRupees: z.number(),
      quantity: z.number().int().positive(),
      server: z.enum(['food', 'instamart']),
    })
  ),
});

// POST /api/v1/orders/hop-pack — cap-aware multi-hop cart plan
app.post('/hop-pack', zValidator('json', HopPackSchema), async (c) => {
  const { lines } = c.req.valid('json');
  return c.json({ success: true, data: planHopPacking(lines) });
});

const MultiHopSchema = z.object({
  journeyId: z.string().min(1),
  hops: z
    .array(
      z.object({
        interceptId: z.string().min(1),
        server: z.enum(['food', 'instamart']),
        timing: z.enum(['now', 'auto']).default('auto'),
        restaurantId: z.string().optional(),
        foodItems: PlaceOrderSchema.shape.foodItems,
        productItems: PlaceOrderSchema.shape.productItems,
        paymentMethod: z.string().optional(),
        couponCode: z.string().optional(),
      })
    )
    .min(1)
    .max(5),
});

// POST /api/v1/orders/multi-hop — place/queue one order per intercept hop
app.post('/multi-hop', zValidator('json', MultiHopSchema), async (c) => {
  const body = c.req.valid('json');
  const token = c.get('accessToken');
  const user = c.get('user');
  const results = [];
  for (const hop of body.hops) {
    const result = await placeOrder(
      {
        ...hop,
        journeyId: body.journeyId,
        userId: user.id,
        timing: hop.timing ?? 'auto',
      },
      token
    );
    if (result.swiggyOrderId) {
      startPolling(result.orderId, result.swiggyOrderId, hop.server, token);
    }
    results.push(result);
  }
  return c.json({ success: true, data: { orders: results, hopCount: results.length } });
});

const ReInterceptSchema = z.object({
  newInterceptId: z.string().min(1),
  flushCart: z.boolean().optional().default(true),
});

// POST /api/v1/orders/:id/re-intercept — mid-journey switch dropoff + flush Swiggy cart
app.post('/:id/re-intercept', zValidator('json', ReInterceptSchema), async (c) => {
  const id = c.req.param('id');
  const { newInterceptId, flushCart } = c.req.valid('json');
  const token = c.get('accessToken');
  const user = c.get('user');
  const db = getDb();
  const order = await requireOrderOwnership(id, user.id, c);

  if (order.swiggyOrderId && !['pending', 'confirmed'].includes(order.status)) {
    throw new RouteBiteError(
      'VALIDATION_ERROR',
      'Cannot re-intercept after kitchen/rider handoff',
      400
    );
  }

  const point = await db.select().from(intercepts).where(eq(intercepts.id, newInterceptId)).get();
  if (!point || (order.journeyId && point.journeyId !== order.journeyId)) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Intercept not on this journey', 400);
  }

  let flushed = false;
  if (flushCart) {
    try {
      const client = new SwiggyMCPClient(token);
      if (order.server === 'food') {
        await client.flushFoodCart();
        flushed = true;
      } else {
        await client.clearInstamartCart();
        flushed = true;
      }
    } catch {
      flushed = false;
    }
  }

  // Pending deferred orders can retarget; confirmed Swiggy orders keep ID but note the switch
  await db
    .update(orders)
    .set({
      interceptId: newInterceptId,
      notes: `${order.notes ?? ''}\n\nRe-intercept → ${newInterceptId} at ${new Date().toISOString()}`,
      lastPlaceError: order.swiggyOrderId
        ? 'Re-intercept after place — track dropoff updated; rider brief may need refresh'
        : order.lastPlaceError,
    })
    .where(eq(orders.id, id));

  return c.json({
    success: true,
    data: {
      orderId: id,
      previousInterceptId: order.interceptId,
      newInterceptId,
      flushed,
      actions: ['create_address', 're_search', ...(flushed ? ['flush_cart'] : [])],
      message: flushed
        ? 'Cart flushed. Pick kitchen again at the new intercept.'
        : 'Intercept updated. Re-search catalog at the new stop.',
    },
  });
});

// GET /api/v1/orders/:id/tracking-history — time-series from DB
app.get('/:id/tracking-history', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200);
  const user = c.get('user');

  // Ownership check
  await requireOrderOwnership(id, user.id, c);

  const db = getDb();
  const events = await db
    .select()
    .from(trackingEvents)
    .where(eq(trackingEvents.orderId, id))
    .orderBy(desc(trackingEvents.recordedAt))
    .limit(limit);

  return c.json({
    success: true,
    data: events.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      riderLat: e.riderLat,
      riderLng: e.riderLng,
      customerETA: e.customerETA,
      riderETA: e.riderETA,
      alignmentScore: e.alignmentScore,
      recordedAt: e.recordedAt?.toISOString() ?? null,
    })),
  });
});

// DELETE /api/v1/orders/:id (cancel)
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb();

  const order = await requireOrderOwnership(id, user.id, c);

  // Only cancel if pending or confirmed
  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Order cannot be cancelled at this stage', 400);
  }

  await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));

  return c.json({ success: true, data: { orderId: id, status: 'cancelled' } });
});

export default app;
