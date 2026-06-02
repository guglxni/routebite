import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, trackingEvents } from '@routebite/db/schema';
import { placeOrder } from '../services/order/placement';
import { SwiggyMCPClient } from '../services/swiggy/client';
import { computeAlignment } from '../services/tracking/alignment';
import { startPolling } from '../services/tracking/poller';
import { loadCustomerContextForOrder } from '../services/tracking/customer-context';
import { RouteBiteError } from '../middleware/error-handler';

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
async function requireOrderOwnership(orderId: string, userId: number) {
  const db = getDb();
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.userId !== userId) {
    throw new RouteBiteError('NOT_FOUND', 'Order not found', 404);
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
  const order = await requireOrderOwnership(id, user.id);
  return c.json({ success: true, data: order });
});

// GET /api/v1/orders/:id/track — live snapshot + start poller
app.get('/:id/track', async (c) => {
  const id = c.req.param('id');
  const token = c.get('accessToken');
  const user = c.get('user');

  const order = await requireOrderOwnership(id, user.id);

  if (!order.swiggyOrderId) {
    return c.json({
      success: true,
      data: {
        orderId: id,
        status: order.status,
        swiggyOrderId: null,
        tracking: null,
      },
    });
  }

  // Ensure polling is running
  startPolling(id, order.swiggyOrderId, order.server as 'food' | 'instamart', token);

  const client = new SwiggyMCPClient(token);
  const trackRes =
    order.server === 'food'
      ? await client.trackFoodOrder({ orderId: order.swiggyOrderId })
      : await client.trackInstamartOrder({ orderId: order.swiggyOrderId });

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

  // Compute alignment
  let alignmentStatus = null;
  if (customerETA !== undefined && riderETA !== undefined) {
    alignmentStatus = computeAlignment({
      customerETA,
      riderETA,
      orderStatus: order.status,
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
      customerETA,
      riderETA,
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
      alignmentStatus,
      ...(process.env.NODE_ENV !== 'production' ? { raw } : {}),
    },
  });
});

// GET /api/v1/orders/:id/tracking-history — time-series from DB
app.get('/:id/tracking-history', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200);
  const user = c.get('user');

  // Ownership check
  await requireOrderOwnership(id, user.id);

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

  const order = await requireOrderOwnership(id, user.id);

  // Only cancel if pending or confirmed
  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Order cannot be cancelled at this stage', 400);
  }

  await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));

  return c.json({ success: true, data: { orderId: id, status: 'cancelled' } });
});

export default app;
