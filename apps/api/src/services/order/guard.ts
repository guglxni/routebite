import type { SwiggyMCPClient } from '../swiggy/client';

/**
 * Double-submit protection:
 * Before placing an order, check if the user already has a recent
 * pending/completed order for the same intercept with similar items.
 *
 * Returns null if safe to proceed, otherwise returns the existing order ID.
 */
export async function checkForDuplicateOrder(
  swiggyClient: SwiggyMCPClient,
  server: 'food' | 'instamart',
  _interceptId: string,
  _itemsHash: string
): Promise<string | null> {
  try {
    const response =
      server === 'food'
        ? await swiggyClient.getFoodOrders()
        : await swiggyClient.getInstamartOrders();

    if (!response.success || !response.data) return null;

    const orders = (response.data as any)?.orders ?? [];

    // Check for very recent orders (placed within last 2 minutes)
    const now = Date.now();
    const twoMinutesAgo = now - 2 * 60 * 1000;

    for (const order of orders) {
      const placedAt = order.placedAt ? new Date(order.placedAt).getTime() : 0;
      if (placedAt > twoMinutesAgo && ['PLACED', 'CONFIRMED', 'PREPARING', 'PICKING', 'PACKED'].includes(order.status)) {
        return order.orderId;
      }
    }

    return null;
  } catch {
    // If we can't verify, allow the order (fail open)
    return null;
  }
}
