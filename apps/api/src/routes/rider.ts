import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { intercepts, journeys, orders, trackingEvents, users } from '@routebite/db/schema';
import { haversineMeters } from '@routebite/shared/algorithms';
import { riderTransportMode } from '@routebite/shared/constants';
import { RouteBiteError } from '../middleware/error-handler';
import { mapsClient } from '../services/maps/client';
import { computeAlignment } from '../services/tracking/alignment';

const app = new Hono();

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery'] as const;

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  riderETA: z.number().int().positive().optional(),
  accuracy: z.number().positive().optional(),
});

const StatusSchema = z.object({
  status: z.enum(['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']),
});

const PresenceSchema = z.object({
  presence: z.enum(['offline', 'online', 'busy']),
});

type DeliveryRow = {
  id: string;
  status: string;
  server: string;
  totalAmount: number;
  timingType: string;
  journeyId: string | null;
  interceptId: string | null;
  riderId: number | null;
  placedAt: Date | null;
  createdAt: Date | null;
  originAddress: string | null;
  destAddress: string | null;
  originLat: number | null;
  originLng: number | null;
  destLat: number | null;
  destLng: number | null;
  routePolyline: string | null;
  estimatedDuration: number | null;
  interceptLat: number | null;
  interceptLng: number | null;
  interceptName: string | null;
  interceptType: string | null;
  interceptScore: number | null;
};

function mapDelivery(r: DeliveryRow, mine: boolean) {
  return {
    id: r.id,
    status: r.status,
    server: r.server,
    totalAmount: r.totalAmount,
    timingType: r.timingType,
    journeyId: r.journeyId,
    interceptId: r.interceptId,
    riderId: r.riderId,
    assignedToMe: mine,
    placedAt: r.placedAt,
    createdAt: r.createdAt,
    dropoff: {
      lat: r.interceptLat,
      lng: r.interceptLng,
      name: r.interceptName ?? r.interceptType ?? 'Intercept',
      score: r.interceptScore,
    },
    journey: r.journeyId
      ? {
          originAddress: r.originAddress,
          destAddress: r.destAddress,
          originLat: r.originLat,
          originLng: r.originLng,
          destLat: r.destLat,
          destLng: r.destLng,
          estimatedDuration: r.estimatedDuration,
        }
      : null,
  };
}

async function selectDeliveries(where?: SQL) {
  const db = getDb();
  const base = db
    .select({
      id: orders.id,
      status: orders.status,
      server: orders.server,
      totalAmount: orders.totalAmount,
      timingType: orders.timingType,
      journeyId: orders.journeyId,
      interceptId: orders.interceptId,
      riderId: orders.riderId,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      originAddress: journeys.originAddress,
      destAddress: journeys.destAddress,
      originLat: journeys.originLat,
      originLng: journeys.originLng,
      destLat: journeys.destLat,
      destLng: journeys.destLng,
      routePolyline: journeys.routePolyline,
      estimatedDuration: journeys.estimatedDuration,
      interceptLat: intercepts.lat,
      interceptLng: intercepts.lng,
      interceptName: intercepts.name,
      interceptType: intercepts.type,
      interceptScore: intercepts.score,
    })
    .from(orders)
    .leftJoin(journeys, eq(orders.journeyId, journeys.id))
    .leftJoin(intercepts, eq(orders.interceptId, intercepts.id));

  const rows = where
    ? await base.where(where).orderBy(desc(orders.createdAt)).all()
    : await base.orderBy(desc(orders.createdAt)).all();

  return rows as DeliveryRow[];
}

function sanitizeEta(sec: number | null | undefined): number | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  // Cap at 2h — matrix sometimes returns multi-day nonsense
  if (sec > 2 * 3600) return null;
  return Math.round(sec);
}

/** Beyond this, dropoff is not a realistic food-delivery hop — skip ETA. */
const MAX_DELIVERY_ETA_DISTANCE_M = 80_000;

async function estimateEtaSeconds(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<number | null> {
  const distM = haversineMeters(from, to);
  if (distM > MAX_DELIVERY_ETA_DISTANCE_M) return null;
  try {
    const sec = sanitizeEta(await mapsClient.getTravelTime(from, to, riderTransportMode('food')));
    if (sec != null) return sec;
  } catch {
    /* fall through */
  }
  // ~25 km/h two-wheeler urban fallback — still sanitize so multi-hour junk is dropped
  return sanitizeEta(Math.max(120, Math.round(distM / 7)));
}

const TRACKING_MIN_GAP_MS = 12_000;
const ETA_MIN_GAP_MS = 30_000;

/** Insert a tracking ping with throttling + optional ETA (avoids Routes spam). */
async function recordRiderPing(
  orderId: string,
  lat: number,
  lng: number,
  opts?: { forceEta?: boolean; riderETA?: number }
): Promise<number | null> {
  const db = getDb();
  const last = await db
    .select()
    .from(trackingEvents)
    .where(eq(trackingEvents.orderId, orderId))
    .orderBy(desc(trackingEvents.recordedAt))
    .limit(1)
    .get();

  const lastAt = last?.recordedAt ? new Date(last.recordedAt).getTime() : 0;
  const age = Date.now() - lastAt;
  const lastEta = sanitizeEta(last?.riderETA);
  if (last && age < TRACKING_MIN_GAP_MS && lastEta != null) {
    // Skip flooding tracking_events; caller still updates users.last_*
    return lastEta;
  }

  let riderETA = sanitizeEta(opts?.riderETA);
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  const shouldComputeEta =
    riderETA == null &&
    Boolean(order?.interceptId) &&
    (opts?.forceEta === true || lastEta == null || age >= ETA_MIN_GAP_MS);

  if (shouldComputeEta && order?.interceptId) {
    const intercept = await db
      .select()
      .from(intercepts)
      .where(eq(intercepts.id, order.interceptId))
      .get();
    if (intercept) {
      riderETA = await estimateEtaSeconds(
        { lat, lng },
        { lat: intercept.lat, lng: intercept.lng }
      );
    }
  } else if (riderETA == null) {
    riderETA = lastEta;
  }

  await db.insert(trackingEvents).values({
    orderId,
    riderLat: lat,
    riderLng: lng,
    riderETA: riderETA ?? undefined,
  });

  return riderETA;
}

async function refreshPresenceFromJobs(riderId: number) {
  const db = getDb();
  const [active] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.riderId, riderId),
        inArray(orders.status, [...ACTIVE_STATUSES])
      )
    )
    .all();
  const hasJobs = Number(active?.n ?? 0) > 0;
  const rider = await db.select().from(users).where(eq(users.id, riderId)).get();
  if (!rider) return;
  const presence = rider.riderPresence ?? 'offline';
  if (presence === 'offline') return;
  const next = hasJobs ? 'busy' : 'online';
  if (presence !== next) {
    await db
      .update(users)
      .set({ riderPresence: next, updatedAt: new Date() })
      .where(eq(users.id, riderId));
  }
}

// GET /api/v1/rider/me
app.get('/me', async (c) => {
  const user = c.get('user');
  const db = getDb();
  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  return c.json({
    success: true,
    data: {
      id: user.id,
      role: user.role,
      name: user.name,
      username: user.username,
      email: user.email,
      presence: row?.riderPresence ?? 'offline',
      lastLocation:
        row?.lastLat != null && row?.lastLng != null
          ? {
              lat: row.lastLat,
              lng: row.lastLng,
              at: row.lastLocationAt,
            }
          : null,
    },
  });
});

// PATCH /api/v1/rider/presence
app.patch('/presence', zValidator('json', PresenceSchema), async (c) => {
  const user = c.get('user');
  const { presence } = c.req.valid('json');
  const db = getDb();

  let next = presence;
  if (presence === 'online') {
    const [active] = await db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(eq(orders.riderId, user.id), inArray(orders.status, [...ACTIVE_STATUSES]))
      )
      .all();
    if (Number(active?.n ?? 0) > 0) next = 'busy';
  }

  await db
    .update(users)
    .set({ riderPresence: next, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return c.json({ success: true, data: { presence: next } });
});

// GET /api/v1/rider/jobs — unassigned active pool
app.get('/jobs', async (c) => {
  const rows = await selectDeliveries(
    and(inArray(orders.status, [...ACTIVE_STATUSES]), isNull(orders.riderId))
  );
  return c.json({
    success: true,
    data: rows.map((r) => mapDelivery(r, false)),
  });
});

// GET /api/v1/rider/deliveries?scope=mine|available|all
app.get('/deliveries', async (c) => {
  const user = c.get('user');
  const scope = c.req.query('scope') ?? 'mine';

  let where;
  if (scope === 'available') {
    where = and(inArray(orders.status, [...ACTIVE_STATUSES]), isNull(orders.riderId));
  } else if (scope === 'all') {
    where = inArray(orders.status, [...ACTIVE_STATUSES]);
  } else {
    where = and(
      eq(orders.riderId, user.id),
      inArray(orders.status, [...ACTIVE_STATUSES])
    );
  }

  const rows = await selectDeliveries(where);
  return c.json({
    success: true,
    data: rows.map((r) => mapDelivery(r, r.riderId === user.id)),
  });
});

// GET /api/v1/rider/history
app.get('/history', async (c) => {
  const user = c.get('user');
  const rows = await selectDeliveries(
    and(
      eq(orders.riderId, user.id),
      inArray(orders.status, ['delivered', 'cancelled', 'failed'])
    )
  );
  return c.json({
    success: true,
    data: rows.slice(0, 40).map((r) => mapDelivery(r, true)),
  });
});

// GET /api/v1/rider/deliveries/:id
app.get('/deliveries/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb();

  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new RouteBiteError('NOT_FOUND', 'Delivery not found', 404);

  const journey = order.journeyId
    ? await db.select().from(journeys).where(eq(journeys.id, order.journeyId)).get()
    : null;
  const intercept = order.interceptId
    ? await db.select().from(intercepts).where(eq(intercepts.id, order.interceptId)).get()
    : null;
  const events = await db
    .select()
    .from(trackingEvents)
    .where(eq(trackingEvents.orderId, id))
    .orderBy(desc(trackingEvents.recordedAt))
    .limit(30)
    .all();

  const routePoints =
    journey?.routePolyline != null && journey.routePolyline.length > 0
      ? mapsClient.decodePolyline(journey.routePolyline)
      : [];

  const lastRider = events.find((e) => e.riderLat != null && e.riderLng != null);
  const lastAlign = events.find((e) => e.alignmentScore != null);
  let haltGate = null;
  try {
    haltGate = order.haltGateJson ? JSON.parse(order.haltGateJson) : null;
  } catch {
    haltGate = null;
  }
  const briefMatch = order.notes?.match(/Rider brief:\s*([\s\S]*?)(?:\nMeal:|$)/);
  const riderBrief = briefMatch?.[1]?.trim() ?? null;

  let alignment = null;
  if (
    lastAlign?.customerETA != null &&
    lastAlign?.riderETA != null
  ) {
    alignment = computeAlignment({
      customerETA: lastAlign.customerETA,
      riderETA: lastAlign.riderETA,
      orderStatus: order.status,
      riderPosition:
        lastRider?.riderLat != null && lastRider?.riderLng != null
          ? { lat: lastRider.riderLat, lng: lastRider.riderLng }
          : undefined,
    });
  }

  return c.json({
    success: true,
    data: {
      order,
      journey,
      intercept,
      tracking: events,
      routePoints,
      assignedToMe: order.riderId === user.id,
      lastRiderPosition:
        lastRider?.riderLat != null && lastRider?.riderLng != null
          ? {
              lat: lastRider.riderLat,
              lng: lastRider.riderLng,
              eta: sanitizeEta(lastRider.riderETA),
            }
          : null,
      mapsUrl:
        intercept?.lat != null && intercept?.lng != null
          ? `https://www.google.com/maps/dir/?api=1&destination=${intercept.lat},${intercept.lng}&travelmode=driving`
          : null,
      amountRupees: Math.round((order.totalAmount ?? 0) / 100),
      fusion: {
        riderBrief,
        mealQueryHint: order.mealQueryHint,
        haltGate,
        autoPlaceAt: order.autoPlaceAt,
        timingType: order.timingType,
        alignment,
        deferredPending: order.timingType === 'auto' && !order.swiggyOrderId,
      },
    },
  });
});

// POST /api/v1/rider/deliveries/:id/claim
app.post('/deliveries/:id/claim', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb();

  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new RouteBiteError('NOT_FOUND', 'Delivery not found', 404);
  if (!ACTIVE_STATUSES.includes(order.status as (typeof ACTIVE_STATUSES)[number])) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Order is not claimable', 400);
  }
  if (order.riderId === user.id) {
    return c.json({ success: true, data: { id, riderId: user.id, status: order.status } });
  }
  if (order.riderId != null) {
    throw new RouteBiteError('CONFLICT', 'Delivery already claimed by another rider', 409);
  }

  // Atomic claim — only one rider wins under concurrency
  await db
    .update(orders)
    .set({ riderId: user.id })
    .where(and(eq(orders.id, id), isNull(orders.riderId)));

  const after = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!after || after.riderId !== user.id) {
    throw new RouteBiteError('CONFLICT', 'Delivery already claimed by another rider', 409);
  }

  await db
    .update(users)
    .set({ riderPresence: 'busy', updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return c.json({
    success: true,
    data: { id, riderId: user.id, status: after.status },
  });
});

// POST /api/v1/rider/deliveries/:id/release
app.post('/deliveries/:id/release', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb();

  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new RouteBiteError('NOT_FOUND', 'Delivery not found', 404);
  if (order.riderId !== user.id) {
    throw new RouteBiteError('FORBIDDEN', 'You do not own this delivery', 403);
  }
  if (order.status === 'delivered') {
    throw new RouteBiteError('VALIDATION_ERROR', 'Cannot release a delivered order', 400);
  }

  await db.update(orders).set({ riderId: null }).where(eq(orders.id, id));
  await refreshPresenceFromJobs(user.id);

  return c.json({ success: true, data: { id, riderId: null } });
});

// PATCH /api/v1/rider/deliveries/:id/location
app.patch('/deliveries/:id/location', zValidator('json', LocationSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');
  const db = getDb();

  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new RouteBiteError('NOT_FOUND', 'Delivery not found', 404);
  if (order.riderId !== user.id) {
    throw new RouteBiteError('FORBIDDEN', 'Claim this delivery before sharing GPS', 403);
  }
  if (!ACTIVE_STATUSES.includes(order.status as (typeof ACTIVE_STATUSES)[number])) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Order is not an active delivery', 400);
  }

  const riderETA = await recordRiderPing(id, body.lat, body.lng, {
    riderETA: body.riderETA,
  });

  await db
    .update(users)
    .set({
      lastLat: body.lat,
      lastLng: body.lng,
      lastLocationAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return c.json({
    success: true,
    data: {
      orderId: id,
      riderPosition: { lat: body.lat, lng: body.lng },
      riderETA: riderETA ?? null,
      recordedAt: new Date().toISOString(),
    },
  });
});

// PATCH /api/v1/rider/location — update fleet pin + throttle-ping active jobs
app.patch('/location', zValidator('json', LocationSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const db = getDb();

  await db
    .update(users)
    .set({
      lastLat: body.lat,
      lastLng: body.lng,
      lastLocationAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  const mine = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.riderId, user.id), inArray(orders.status, [...ACTIVE_STATUSES]))
    )
    .all();

  const pinged: string[] = [];
  let primaryEta: number | null = null;
  for (const o of mine.slice(0, 5)) {
    const eta = await recordRiderPing(o.id, body.lat, body.lng, {
      riderETA: body.riderETA,
    });
    pinged.push(o.id);
    if (primaryEta == null && eta != null) primaryEta = eta;
  }

  return c.json({
    success: true,
    data: {
      lat: body.lat,
      lng: body.lng,
      pingedOrders: pinged,
      riderETA: primaryEta,
    },
  });
});

// PATCH /api/v1/rider/deliveries/:id/status
app.patch('/deliveries/:id/status', zValidator('json', StatusSchema), async (c) => {
  const id = c.req.param('id');
  const { status } = c.req.valid('json');
  const user = c.get('user');
  const db = getDb();

  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new RouteBiteError('NOT_FOUND', 'Delivery not found', 404);
  if (order.riderId !== user.id) {
    throw new RouteBiteError('FORBIDDEN', 'Claim this delivery before updating status', 403);
  }

  const allowed: Record<string, string[]> = {
    pending: ['confirmed', 'preparing', 'out_for_delivery', 'cancelled'],
    confirmed: ['preparing', 'out_for_delivery', 'cancelled'],
    preparing: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered', 'cancelled'],
  };
  const nextOk = allowed[order.status] ?? [];
  if (!nextOk.includes(status)) {
    throw new RouteBiteError(
      'VALIDATION_ERROR',
      `Cannot transition ${order.status} → ${status}`,
      400
    );
  }

  await db.update(orders).set({ status }).where(eq(orders.id, id));
  await refreshPresenceFromJobs(user.id);

  return c.json({
    success: true,
    data: { id, status, previousStatus: order.status },
  });
});

// GET /api/v1/rider/stats — mine
app.get('/stats', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const [active] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(eq(orders.riderId, user.id), inArray(orders.status, [...ACTIVE_STATUSES]))
    )
    .all();
  const [delivered] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.riderId, user.id), eq(orders.status, 'delivered')))
    .all();
  const [available] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(inArray(orders.status, [...ACTIVE_STATUSES]), isNull(orders.riderId)))
    .all();

  const rider = await db.select().from(users).where(eq(users.id, user.id)).get();

  return c.json({
    success: true,
    data: {
      activeDeliveries: Number(active?.n ?? 0),
      deliveredTotal: Number(delivered?.n ?? 0),
      availableJobs: Number(available?.n ?? 0),
      presence: rider?.riderPresence ?? 'offline',
      riderId: user.id,
      name: user.name,
    },
  });
});

export default app;
