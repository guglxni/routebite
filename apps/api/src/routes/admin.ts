import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { intercepts, journeys, orders, trackingEvents, users } from '@routebite/db/schema';
import { RouteBiteError } from '../middleware/error-handler';
import {
  listDeferredQueue,
  tickDeferredPlacer,
} from '../services/fusion/deferred-placer';

const app = new Hono();

const ACTIVE = ['pending', 'confirmed', 'preparing', 'out_for_delivery'] as const;

const PatchOrderSchema = z.object({
  status: z
    .enum(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'failed'])
    .optional(),
  riderId: z.number().int().positive().nullable().optional(),
});

const PatchUserSchema = z.object({
  role: z.enum(['user', 'rider', 'admin']).optional(),
  revokeSession: z.boolean().optional(),
});

// GET /api/v1/admin/overview
app.get('/overview', async (c) => {
  const db = getDb();

  const [userCount] = await db.select({ n: sql<number>`count(*)` }).from(users).all();
  const [journeyCount] = await db.select({ n: sql<number>`count(*)` }).from(journeys).all();
  const [orderCount] = await db.select({ n: sql<number>`count(*)` }).from(orders).all();
  const [activeOrders] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(inArray(orders.status, [...ACTIVE]))
    .all();
  const [unassigned] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(inArray(orders.status, [...ACTIVE]), isNull(orders.riderId)))
    .all();
  const [ridersOnline] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(
      and(
        eq(users.role, 'rider'),
        inArray(users.riderPresence, ['online', 'busy'])
      )
    )
    .all();
  const [delivered] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.status, 'delivered'))
    .all();

  const [avgAlign] = await db
    .select({ avg: sql<number>`avg(${trackingEvents.alignmentScore})` })
    .from(trackingEvents)
    .where(sql`${trackingEvents.alignmentScore} is not null`)
    .all();

  const byRole = await db
    .select({
      role: users.role,
      n: sql<number>`count(*)`,
    })
    .from(users)
    .groupBy(users.role)
    .all();

  return c.json({
    success: true,
    data: {
      users: Number(userCount?.n ?? 0),
      journeys: Number(journeyCount?.n ?? 0),
      orders: Number(orderCount?.n ?? 0),
      activeOrders: Number(activeOrders?.n ?? 0),
      unassignedOrders: Number(unassigned?.n ?? 0),
      ridersOnline: Number(ridersOnline?.n ?? 0),
      deliveredOrders: Number(delivered?.n ?? 0),
      avgAlignmentScore:
        avgAlign?.avg != null && Number.isFinite(Number(avgAlign.avg))
          ? Math.round(Number(avgAlign.avg) * 10) / 10
          : null,
      usersByRole: byRole.map((r) => ({
        role: r.role ?? 'user',
        count: Number(r.n ?? 0),
      })),
      generatedAt: new Date().toISOString(),
    },
  });
});

// GET /api/v1/admin/fleet — riders + last GPS + active job count
app.get('/fleet', async (c) => {
  const db = getDb();
  const riders = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      presence: users.riderPresence,
      lastLat: users.lastLat,
      lastLng: users.lastLng,
      lastLocationAt: users.lastLocationAt,
    })
    .from(users)
    .where(eq(users.role, 'rider'))
    .all();

  const activeByRider = await db
    .select({
      riderId: orders.riderId,
      n: sql<number>`count(*)`,
    })
    .from(orders)
    .where(and(inArray(orders.status, [...ACTIVE]), sql`${orders.riderId} is not null`))
    .groupBy(orders.riderId)
    .all();

  const countMap = new Map(
    activeByRider.map((r) => [r.riderId!, Number(r.n ?? 0)])
  );

  return c.json({
    success: true,
    data: riders.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      presence: r.presence ?? 'offline',
      activeJobs: countMap.get(r.id) ?? 0,
      location:
        r.lastLat != null && r.lastLng != null
          ? { lat: r.lastLat, lng: r.lastLng, at: r.lastLocationAt }
          : null,
    })),
  });
});

// GET /api/v1/admin/users
app.get('/users', async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      role: users.role,
      riderPresence: users.riderPresence,
      createdAt: users.createdAt,
      tokenExpiry: users.tokenExpiry,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .all();

  return c.json({
    success: true,
    data: rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      role: u.role ?? 'user',
      riderPresence: u.riderPresence ?? null,
      createdAt: u.createdAt,
      tokenExpiry: u.tokenExpiry,
      sessionActive: u.tokenExpiry ? u.tokenExpiry > new Date() : false,
    })),
  });
});

// PATCH /api/v1/admin/users/:id
app.patch('/users/:id', zValidator('json', PatchUserSchema), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = c.req.valid('json');
  const admin = c.get('user');
  const db = getDb();

  if (!Number.isFinite(id)) throw new RouteBiteError('VALIDATION_ERROR', 'Invalid user id', 400);
  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target) throw new RouteBiteError('NOT_FOUND', 'User not found', 404);

  if (body.role && id === admin.id && body.role !== 'admin') {
    throw new RouteBiteError('VALIDATION_ERROR', 'Cannot demote your own admin role', 400);
  }

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (body.role) patch.role = body.role;
  if (body.revokeSession) patch.sessionToken = null;

  await db.update(users).set(patch).where(eq(users.id, id));
  const updated = await db.select().from(users).where(eq(users.id, id)).get();

  return c.json({
    success: true,
    data: {
      id,
      role: updated?.role,
      sessionRevoked: Boolean(body.revokeSession),
    },
  });
});

// GET /api/v1/admin/orders
app.get('/orders', async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);
  const status = c.req.query('status');

  const base = db
    .select({
      id: orders.id,
      userId: orders.userId,
      riderId: orders.riderId,
      status: orders.status,
      server: orders.server,
      totalAmount: orders.totalAmount,
      timingType: orders.timingType,
      journeyId: orders.journeyId,
      interceptId: orders.interceptId,
      createdAt: orders.createdAt,
      placedAt: orders.placedAt,
      interceptLat: intercepts.lat,
      interceptLng: intercepts.lng,
      interceptName: intercepts.name,
    })
    .from(orders)
    .leftJoin(intercepts, eq(orders.interceptId, intercepts.id));

  const rows = status
    ? await base
        .where(sql`${orders.status} = ${status}`)
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .all()
    : await base.orderBy(desc(orders.createdAt)).limit(limit).all();

  return c.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      riderId: r.riderId,
      status: r.status,
      server: r.server,
      totalAmount: r.totalAmount,
      timingType: r.timingType,
      journeyId: r.journeyId,
      interceptId: r.interceptId,
      createdAt: r.createdAt,
      placedAt: r.placedAt,
      dropoff:
        r.interceptLat != null
          ? { lat: r.interceptLat, lng: r.interceptLng, name: r.interceptName }
          : null,
    })),
  });
});

// PATCH /api/v1/admin/orders/:id — cancel / assign rider / force status
app.patch('/orders/:id', zValidator('json', PatchOrderSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const db = getDb();

  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new RouteBiteError('NOT_FOUND', 'Order not found', 404);

  if (body.riderId !== undefined && body.riderId !== null) {
    const rider = await db.select().from(users).where(eq(users.id, body.riderId)).get();
    if (!rider || rider.role !== 'rider') {
      throw new RouteBiteError('VALIDATION_ERROR', 'riderId must be a rider user', 400);
    }
  }

  const patch: Partial<typeof orders.$inferInsert> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.riderId !== undefined) patch.riderId = body.riderId;

  if (Object.keys(patch).length === 0) {
    throw new RouteBiteError('VALIDATION_ERROR', 'No changes provided', 400);
  }

  await db.update(orders).set(patch).where(eq(orders.id, id));
  const updated = await db.select().from(orders).where(eq(orders.id, id)).get();

  // Keep rider presence in sync when admin assigns / clears a job
  if (body.riderId !== undefined) {
    if (body.riderId != null) {
      await db
        .update(users)
        .set({ riderPresence: 'busy', updatedAt: new Date() })
        .where(eq(users.id, body.riderId));
    }
    if (order.riderId != null && order.riderId !== body.riderId) {
      const [active] = await db
        .select({ n: sql<number>`count(*)` })
        .from(orders)
        .where(
          and(
            eq(orders.riderId, order.riderId),
            inArray(orders.status, [...ACTIVE])
          )
        )
        .all();
      const prev = await db.select().from(users).where(eq(users.id, order.riderId)).get();
      if (prev && prev.riderPresence !== 'offline') {
        await db
          .update(users)
          .set({
            riderPresence: Number(active?.n ?? 0) > 0 ? 'busy' : 'online',
            updatedAt: new Date(),
          })
          .where(eq(users.id, order.riderId));
      }
    }
  }

  return c.json({ success: true, data: updated });
});

// GET /api/v1/admin/journeys
app.get('/journeys', async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);

  const rows = await db
    .select({
      id: journeys.id,
      userId: journeys.userId,
      originAddress: journeys.originAddress,
      destAddress: journeys.destAddress,
      originLat: journeys.originLat,
      originLng: journeys.originLng,
      destLat: journeys.destLat,
      destLng: journeys.destLng,
      transportMode: journeys.transportMode,
      status: journeys.status,
      estimatedDuration: journeys.estimatedDuration,
      createdAt: journeys.createdAt,
    })
    .from(journeys)
    .orderBy(desc(journeys.createdAt))
    .limit(limit)
    .all();

  return c.json({ success: true, data: rows });
});

// GET /api/v1/admin/tracking/recent
app.get('/tracking/recent', async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(trackingEvents)
    .orderBy(desc(trackingEvents.recordedAt))
    .limit(50)
    .all();

  return c.json({ success: true, data: rows });
});

// GET /api/v1/admin/health-detail
app.get('/health-detail', async (c) => {
  const db = getDb();
  const sample = await db.select({ id: users.id }).from(users).limit(1).all();
  const [active] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(inArray(orders.status, [...ACTIVE]))
    .all();

  return c.json({
    success: true,
    data: {
      database: sample.length > 0 ? 'ok' : 'empty',
      portalMode: 'hardcoded',
      adminUserId: c.get('user').id,
      activeOrders: Number(active?.n ?? 0),
      apiTime: new Date().toISOString(),
    },
  });
});

// GET /api/v1/admin/fusion — deferred queue + alignment health
app.get('/fusion', async (c) => {
  const db = getDb();
  const deferred = await listDeferredQueue(50);
  const [deferredCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.timingType, 'auto'),
        eq(orders.status, 'pending'),
        isNull(orders.swiggyOrderId)
      )
    )
    .all();
  const [failedDeferred] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.timingType, 'auto'), eq(orders.status, 'failed')))
    .all();
  const [avgAlign] = await db
    .select({ avg: sql<number>`avg(${trackingEvents.alignmentScore})` })
    .from(trackingEvents)
    .where(sql`${trackingEvents.alignmentScore} is not null`)
    .all();

  return c.json({
    success: true,
    data: {
      deferredPending: Number(deferredCount?.n ?? 0),
      deferredFailed: Number(failedDeferred?.n ?? 0),
      avgAlignmentScore:
        avgAlign?.avg != null && Number.isFinite(Number(avgAlign.avg))
          ? Math.round(Number(avgAlign.avg) * 10) / 10
          : null,
      queue: deferred.map((o) => ({
        id: o.id,
        server: o.server,
        autoPlaceAt: o.autoPlaceAt,
        placeAttempts: o.placeAttempts,
        lastPlaceError: o.lastPlaceError,
        mealQueryHint: o.mealQueryHint,
        interceptId: o.interceptId,
        journeyId: o.journeyId,
        userId: o.userId,
      })),
      generatedAt: new Date().toISOString(),
    },
  });
});

// POST /api/v1/admin/fusion/tick — force deferred placer tick
app.post('/fusion/tick', async (c) => {
  const result = await tickDeferredPlacer();
  return c.json({ success: true, data: result });
});

export default app;
