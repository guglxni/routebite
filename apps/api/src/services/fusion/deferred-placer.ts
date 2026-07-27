import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, intercepts, users } from '@routebite/db/schema';
import { SwiggyMCPClient } from '../swiggy/client';
import { calculateOrderTiming, estimatePrepTime } from '../order/timing';
import { decryptToken } from '../../middleware/auth';
import { startPolling } from '../tracking/poller';
import { evaluateHaltGate } from './halt-gate';

export interface DeferredPayload {
  server: 'food' | 'instamart';
  addressId: string;
  restaurantId?: string;
  restaurantLocation?: { lat: number; lng: number };
  foodItems?: Array<{
    menuItemId: string;
    variantId?: string;
    addonIds?: string[];
    quantity: number;
  }>;
  productItems?: Array<{
    productId: string;
    variantId: string;
    quantity: number;
  }>;
  paymentMethod?: string;
  couponCode?: string;
  dwellSeconds?: number;
  customerEtaSeconds?: number;
}

const TICK_MS = 20_000;
const MAX_ATTEMPTS = 4;
let timer: ReturnType<typeof setInterval> | null = null;

async function decryptUserToken(userId: number): Promise<string | null> {
  const row = await getDb().select().from(users).where(eq(users.id, userId)).get();
  if (!row?.accessTokenEncrypted) return null;
  try {
    return decryptToken(row.accessTokenEncrypted);
  } catch {
    return null;
  }
}

async function placeDeferred(orderId: string): Promise<void> {
  const db = getDb();
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.timingType !== 'auto' || order.swiggyOrderId) return;
  if (order.status !== 'pending') return;

  const payload = order.deferredPayloadJson
    ? (JSON.parse(order.deferredPayloadJson) as DeferredPayload)
    : null;
  if (!payload?.addressId || !order.userId) {
    await db
      .update(orders)
      .set({
        lastPlaceError: 'Missing deferred payload or user',
        placeAttempts: (order.placeAttempts ?? 0) + 1,
      })
      .where(eq(orders.id, orderId));
    return;
  }

  const token = await decryptUserToken(order.userId);
  if (!token) {
    await db
      .update(orders)
      .set({
        lastPlaceError: 'Cannot decrypt Swiggy token — reconnect Swiggy',
        placeAttempts: (order.placeAttempts ?? 0) + 1,
      })
      .where(eq(orders.id, orderId));
    return;
  }

  const intercept = order.interceptId
    ? await db.select().from(intercepts).where(eq(intercepts.id, order.interceptId)).get()
    : null;

  const itemCount =
    payload.foodItems?.length ?? payload.productItems?.length ?? 1;
  const prep = estimatePrepTime(payload.server, itemCount);
  const dwell = payload.dwellSeconds ?? intercept?.estimatedDwellTime ?? 300;
  const customerETA = payload.customerEtaSeconds ?? dwell;

  // Traffic recompute near place time
  const timing = await calculateOrderTiming(
    customerETA,
    prep,
    payload.server === 'food' ? 'bike' : 'car',
    payload.restaurantLocation && intercept
      ? {
          restaurant: payload.restaurantLocation,
          intercept: { lat: intercept.lat, lng: intercept.lng },
        }
      : undefined,
    { includeWeatherBuffer: true, server: payload.server }
  );

  const gate = evaluateHaltGate({
    dwellSeconds: dwell,
    prepSeconds: prep,
    riderTravelSeconds: timing.riderTravel,
    safetyBufferSeconds: timing.safetyBuffer,
    trafficBufferSeconds: timing.trafficBuffer,
    weatherBufferSeconds: timing.weatherBuffer,
  });

  if (!gate.ok && (order.placeAttempts ?? 0) < 1) {
    // Push place earlier once if halt is failing after traffic recompute
    const sooner = new Date(Date.now() + 15_000);
    await db
      .update(orders)
      .set({
        autoPlaceAt: sooner,
        haltGateJson: JSON.stringify(gate),
        lastPlaceError: gate.message,
        placeAttempts: (order.placeAttempts ?? 0) + 1,
      })
      .where(eq(orders.id, orderId));
    return;
  }

  const client = new SwiggyMCPClient(token);

  // Rebuild cart then place (Swiggy has no schedule API)
  if (payload.server === 'food' && payload.foodItems && payload.restaurantId) {
    await client.updateFoodCart({
      restaurantId: payload.restaurantId,
      addressId: payload.addressId,
      cartItems: payload.foodItems.map((it) => ({
        itemId: it.menuItemId,
        quantity: it.quantity,
        ...(it.variantId ? { variantId: it.variantId } : {}),
        ...(it.addonIds?.length ? { addOns: it.addonIds } : {}),
      })),
    });
    if (payload.couponCode) {
      await client.applyFoodCoupon({
        couponCode: payload.couponCode,
        addressId: payload.addressId,
      });
    }
  } else if (payload.server === 'instamart' && payload.productItems) {
    await client.updateInstamartCart({
      selectedAddressId: payload.addressId,
      items: payload.productItems.map((it) => ({
        spinId: it.variantId || it.productId,
        quantity: it.quantity,
      })),
    });
  }

  const placeRes =
    payload.server === 'food'
      ? await client.placeFoodOrder({
          addressId: payload.addressId,
          paymentMethod: payload.paymentMethod ?? 'COD',
        })
      : await client.placeInstamartOrder({
          addressId: payload.addressId,
          paymentMethod: payload.paymentMethod ?? 'COD',
        });

  if (!placeRes.success || !placeRes.data) {
    const attempts = (order.placeAttempts ?? 0) + 1;
    await db
      .update(orders)
      .set({
        placeAttempts: attempts,
        lastPlaceError: placeRes.error?.message ?? 'Deferred place failed',
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        autoPlaceAt:
          attempts >= MAX_ATTEMPTS
            ? order.autoPlaceAt
            : new Date(Date.now() + 60_000 * attempts),
      })
      .where(eq(orders.id, orderId));
    return;
  }

  const swiggyOrderId = (placeRes.data as { orderId?: string }).orderId;
  await db
    .update(orders)
    .set({
      swiggyOrderId,
      status: 'confirmed',
      placedAt: new Date(),
      lastPlaceError: null,
      haltGateJson: JSON.stringify(gate),
      placeAttempts: (order.placeAttempts ?? 0) + 1,
    })
    .where(eq(orders.id, orderId));

  if (swiggyOrderId) {
    startPolling(orderId, swiggyOrderId, payload.server, token);
  }
}

export async function tickDeferredPlacer(): Promise<{ due: number; placed: number }> {
  const db = getDb();
  const now = new Date();
  const due = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.timingType, 'auto'),
        eq(orders.status, 'pending'),
        isNull(orders.swiggyOrderId),
        lte(orders.autoPlaceAt, now)
      )
    )
    .all();

  let placed = 0;
  for (const row of due) {
    try {
      await placeDeferred(row.id);
      const refreshed = await db.select().from(orders).where(eq(orders.id, row.id)).get();
      if (refreshed?.swiggyOrderId) placed += 1;
    } catch (err) {
      await db
        .update(orders)
        .set({
          lastPlaceError: err instanceof Error ? err.message : 'tick error',
          placeAttempts: sql`coalesce(${orders.placeAttempts}, 0) + 1`,
        })
        .where(eq(orders.id, row.id));
    }
  }
  return { due: due.length, placed };
}

export function bootstrapDeferredPlacer(): void {
  if (timer) return;
  void tickDeferredPlacer().catch(() => undefined);
  timer = setInterval(() => {
    void tickDeferredPlacer().catch((err) => {
      console.warn('[deferred-placer]', err instanceof Error ? err.message : err);
    });
  }, TICK_MS);
  if (typeof timer === 'object' && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref?.();
  }
}

export async function listDeferredQueue(limit = 40) {
  const db = getDb();
  return db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.timingType, 'auto'),
        eq(orders.status, 'pending'),
        isNull(orders.swiggyOrderId)
      )
    )
    .all()
    .then((rows) =>
      rows
        .sort(
          (a, b) =>
            (a.autoPlaceAt?.getTime() ?? 0) - (b.autoPlaceAt?.getTime() ?? 0)
        )
        .slice(0, limit)
    );
}
