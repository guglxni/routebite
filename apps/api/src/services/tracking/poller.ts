import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, trackingEvents } from '@routebite/db/schema';
import { SwiggyMCPClient } from '../swiggy/client';
import { computeAlignmentScore, type AlignmentInput } from './alignment';
import type { OrderStatus } from '@routebite/shared/types';

// Orders we actively poll for
const ACTIVE_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'out_for_delivery'];

// Poll interval in ms
const POLL_INTERVAL_MS = 30_000; // 30 seconds

// In-memory registry of active timers (orderId -> timeoutId)
const activePollers = new Map<string, ReturnType<typeof setTimeout>>();

export interface TrackingSnapshot {
  orderId: string;
  customerLat?: number;
  customerLng?: number;
  riderLat?: number;
  riderLng?: number;
  customerETA?: number;
  riderETA?: number;
  orderStatus?: OrderStatus;
  alignmentScore?: number;
  recordedAt: Date;
}

/**
 * Extract normalized tracking data from a raw Swiggy track response.
 * Handles both food and instamart response shapes.
 */
function normalizeTracking(raw: unknown): {
  riderLat?: number;
  riderLng?: number;
  customerETA?: number;
  riderETA?: number;
  orderStatus?: OrderStatus;
} {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;

  // Food tracking shape
  const riderLocation = r.rider_location ?? r.riderPosition ?? r.rider_position;
  let riderLat: number | undefined;
  let riderLng: number | undefined;
  if (riderLocation && typeof riderLocation === 'object') {
    const loc = riderLocation as Record<string, unknown>;
    riderLat = typeof loc.lat === 'number' ? loc.lat : undefined;
    riderLng = typeof loc.lng === 'number' ? loc.lng : undefined;
    if (riderLat === undefined && 'latitude' in loc) {
      riderLat = typeof loc.latitude === 'number' ? loc.latitude : undefined;
    }
    if (riderLng === undefined && 'longitude' in loc) {
      riderLng = typeof loc.longitude === 'number' ? loc.longitude : undefined;
    }
  }

  const customerETA =
    typeof r.customer_eta === 'number'
      ? r.customer_eta
      : typeof r.customerETA === 'number'
        ? r.customerETA
        : typeof r.estimated_delivery_time_seconds === 'number'
          ? r.estimated_delivery_time_seconds
          : undefined;

  const riderETA =
    typeof r.rider_eta === 'number'
      ? r.rider_eta
      : typeof r.riderETA === 'number'
        ? r.riderETA
        : undefined;

  const rawStatus = r.order_status ?? r.orderStatus ?? r.status;
  const orderStatus =
    typeof rawStatus === 'string' && ACTIVE_STATUSES.includes(rawStatus as OrderStatus)
      ? (rawStatus as OrderStatus)
      : undefined;

  return { riderLat, riderLng, customerETA, riderETA, orderStatus };
}

/**
 * Perform a single tracking poll for one order.
 */
async function pollOrder(orderId: string, swiggyOrderId: string, server: 'food' | 'instamart', accessToken: string) {
  const client = new SwiggyMCPClient(accessToken);

  let raw: unknown;
  try {
    const res =
      server === 'food'
        ? await client.trackFoodOrder({ orderId: swiggyOrderId })
        : await client.trackInstamartOrder({ orderId: swiggyOrderId });

    if (!res.success) {
      console.warn(`[tracking] Swiggy track failed for ${orderId}:`, res.error?.message);
      return;
    }
    raw = res.data;
  } catch (err) {
    console.warn(`[tracking] Exception polling ${orderId}:`, (err as Error).message);
    return;
  }

  const normalized = normalizeTracking(raw);

  // We don't have real customer GPS in this demo; set to intercept lat/lng from journey later if needed.
  // For now store what we have.

  let alignmentScore: number | undefined;
  if (normalized.customerETA !== undefined && normalized.riderETA !== undefined) {
    const input: AlignmentInput = {
      customerETA: normalized.customerETA,
      riderETA: normalized.riderETA,
      orderStatus: normalized.orderStatus ?? 'confirmed',
    };
    alignmentScore = computeAlignmentScore(input);
  }

  const db = getDb();
  await db.insert(trackingEvents).values({
    orderId,
    riderLat: normalized.riderLat,
    riderLng: normalized.riderLng,
    customerETA: normalized.customerETA,
    riderETA: normalized.riderETA,
    alignmentScore,
  });

  // Update order status if changed
  if (normalized.orderStatus) {
    await db
      .update(orders)
      .set({ status: normalized.orderStatus })
      .where(eq(orders.id, orderId));
  }

  console.log(`[tracking] Polled ${orderId} — riderETA=${normalized.riderETA}, score=${alignmentScore?.toFixed(2) ?? 'n/a'}`);
}

/**
 * Schedule the next poll for an order.
 */
function schedule(orderId: string, swiggyOrderId: string, server: 'food' | 'instamart', accessToken: string) {
  const existing = activePollers.get(orderId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    try {
      await pollOrder(orderId, swiggyOrderId, server, accessToken);

      // Re-check if still active before rescheduling
      const db = getDb();
      const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
      if (order && ACTIVE_STATUSES.includes(order.status as OrderStatus) && order.swiggyOrderId) {
        schedule(orderId, order.swiggyOrderId, order.server as 'food' | 'instamart', accessToken);
      } else {
        activePollers.delete(orderId);
        console.log(`[tracking] Stopped polling ${orderId} (status=${order?.status ?? 'gone'})`);
      }
    } catch (err) {
      console.error(`[tracking] Poll loop error for ${orderId}:`, err);
      // Retry after delay even on error
      const retryTimer = setTimeout(() => {
        schedule(orderId, swiggyOrderId, server, accessToken);
      }, POLL_INTERVAL_MS);
      activePollers.set(orderId, retryTimer);
    }
  }, POLL_INTERVAL_MS);

  activePollers.set(orderId, timer);
}

/**
 * Start polling for a specific order.
 */
export function startPolling(orderId: string, swiggyOrderId: string, server: 'food' | 'instamart', accessToken: string) {
  if (activePollers.has(orderId)) return; // already polling
  console.log(`[tracking] Started polling ${orderId} (${server})`);
  schedule(orderId, swiggyOrderId, server, accessToken);
}

/**
 * Stop polling for a specific order.
 */
export function stopPolling(orderId: string) {
  const existing = activePollers.get(orderId);
  if (existing) {
    clearTimeout(existing);
    activePollers.delete(orderId);
    console.log(`[tracking] Manually stopped polling ${orderId}`);
  }
}

/**
 * Get the list of currently active poll order IDs.
 */
export function getActivePolls(): string[] {
  return Array.from(activePollers.keys());
}

/**
 * Bootstrap: Resume polling for all active orders on server start.
 * Requires access tokens — in a real app we'd decrypt from DB.
 * Here we skip auto-resume without tokens and let the next track request trigger it.
 */
export async function bootstrapPolling(_getTokenForUser: (userId: number) => Promise<string | undefined>) {
  const db = getDb();
  const activeOrders = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, ACTIVE_STATUSES));

  console.log(`[tracking] Bootstrap: found ${activeOrders.length} active orders (not auto-resuming without tokens)`);
}
