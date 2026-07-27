import type { SwiggyToolResponse, SwiggyTool, SwiggyServer, ClassifiedError } from './types';
import { defaultConfig, swiggyServerPath } from './types';
import { classifyError, getRetryDelay, sleep } from './error-handler';
import { buildToolsCallRequest, parseToolsCallResponse } from './protocol';
import { RETRY_STRATEGY } from '@routebite/shared/constants';
import type {
  ApplyFoodCouponArgs,
  CheckoutArgs,
  CreateAddressArgs,
  DeleteAddressArgs,
  GetFoodCartArgs,
  GetOrderDetailsArgs,
  GetRestaurantMenuArgs,
  PlaceFoodOrderArgs,
  SearchMenuArgs,
  SearchProductsArgs,
  SearchRestaurantsArgs,
  TrackFoodOrderArgs,
  TrackOrderArgs,
  UpdateCartArgs,
  UpdateFoodCartArgs,
  YourGoToItemsArgs,
} from './schemas';

/** Tools that must never be blind-retried after a transport failure. */
const NON_IDEMPOTENT: ReadonlySet<SwiggyTool> = new Set([
  'place_food_order',
  'checkout',
]);

/**
 * Thin client for Swiggy Builders Club MCP (JSON-RPC tools/call).
 * Schemas: https://mcp.swiggy.com/builders/docs/reference/{food,instamart}
 */
export class SwiggyMCPClient {
  private accessToken: string;
  private baseUrl: string;

  constructor(accessToken: string, baseUrl = defaultConfig.baseUrl) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async callTool<T>(
    tool: SwiggyTool,
    params: Record<string, unknown>,
    server: SwiggyServer = 'food'
  ): Promise<SwiggyToolResponse<T>> {
    const path = swiggyServerPath(server);
    let lastError: ClassifiedError | undefined;
    const started = Date.now();

    for (let attempt = 0; attempt < RETRY_STRATEGY.MAX_ATTEMPTS; attempt++) {
      try {
        const payload = buildToolsCallRequest(tool, params);
        const res = await fetch(`${this.baseUrl}/${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        // Planned 429 — honour Retry-After when present
        if (res.status === 429) {
          const seconds = Number(res.headers.get('Retry-After') ?? 30);
          lastError = classifyError(new Error('Rate limited'), 429);
          if (attempt < RETRY_STRATEGY.MAX_ATTEMPTS - 1) {
            await sleep(seconds * 1000);
            continue;
          }
          break;
        }

        const contentType = res.headers.get('content-type') ?? '';
        let body: unknown;
        if (contentType.includes('application/json')) {
          body = await res.json();
        } else {
          const text = await res.text();
          throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
        }

        const envelope = parseToolsCallResponse<T>(body, res.status);

        if (!envelope.success) {
          const err = classifyError(
            new Error(envelope.error?.message ?? 'Unknown error'),
            res.status === 200 ? 400 : res.status
          );
          // Domain failures (HTTP 200 success:false) are terminal
          if (res.status === 200 || !err.retryable) {
            this.logCall(tool, server, started, 'error', envelope.error?.message);
            return envelope as SwiggyToolResponse<T>;
          }
          lastError = err;
        } else {
          this.logCall(tool, server, started, 'ok');
          return envelope as SwiggyToolResponse<T>;
        }
      } catch (err) {
        const classified = classifyError(err);
        if (!classified.retryable) {
          this.logCall(tool, server, started, 'error', classified.message);
          throw new Error(classified.message);
        }
        lastError = classified;

        // Non-idempotent: after transport failure, probe active orders before retrying
        if (NON_IDEMPOTENT.has(tool) && attempt < RETRY_STRATEGY.MAX_ATTEMPTS - 1) {
          await sleep(2000 + Math.random() * 3000);
          const existing = await this.probeRecentOrderId(server);
          if (existing) {
            this.logCall(tool, server, started, 'ok', 'recovered-via-orders-probe');
            return {
              success: true,
              data: { orderId: existing, status: 'PLACED', recovered: true } as T,
            };
          }
          // Do not blind-retry place — only retry if probe says not placed
        }
      }

      if (attempt < RETRY_STRATEGY.MAX_ATTEMPTS - 1) {
        if (NON_IDEMPOTENT.has(tool) && lastError) {
          // Already waited / probed above for place tools; one more attempt max
          continue;
        }
        await sleep(getRetryDelay(attempt));
      }
    }

    this.logCall(tool, server, started, 'error', lastError?.message);
    throw new Error(lastError?.message ?? 'Max retries exceeded');
  }

  private async probeRecentOrderId(server: SwiggyServer): Promise<string | null> {
    try {
      const res =
        server === 'food'
          ? await this.callToolReadonly<{ orders?: Array<{ orderId?: string; placedAt?: string }> }>(
              'get_food_orders',
              {},
              'food'
            )
          : await this.callToolReadonly<{ orders?: Array<{ orderId?: string; placedAt?: string }> }>(
              'get_orders',
              {},
              'instamart'
            );
      if (!res.success || !res.data) return null;
      const orders = (res.data as { orders?: Array<{ orderId?: string; placedAt?: string }> }).orders ?? [];
      const cutoff = Date.now() - 3 * 60 * 1000;
      for (const o of orders) {
        const t = o.placedAt ? new Date(o.placedAt).getTime() : 0;
        if (o.orderId && t >= cutoff) return o.orderId;
      }
      return orders[0]?.orderId ?? null;
    } catch {
      return null;
    }
  }

  /** Internal read that skips nested non-idempotent probe recursion. */
  private async callToolReadonly<T>(
    tool: SwiggyTool,
    params: Record<string, unknown>,
    server: SwiggyServer
  ): Promise<SwiggyToolResponse<T>> {
    const path = swiggyServerPath(server);
    const payload = buildToolsCallRequest(tool, params);
    const res = await fetch(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return parseToolsCallResponse<T>(body, res.status) as SwiggyToolResponse<T>;
  }

  private logCall(
    tool: string,
    server: SwiggyServer,
    started: number,
    status: 'ok' | 'error',
    detail?: string
  ) {
    const line = {
      ts: new Date().toISOString(),
      level: status === 'ok' ? 'info' : 'warn',
      event: 'mcp_tool_call',
      tool,
      server: swiggyServerPath(server),
      duration_ms: Date.now() - started,
      status,
      ...(detail ? { detail } : {}),
    };
    console.log(JSON.stringify(line));
  }

  // ─── Food ─────────────────────────────────────────────────────────────────

  async getAddresses(server: SwiggyServer = 'food'): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('get_addresses', {}, server);
  }

  async searchRestaurants(
    params: SearchRestaurantsArgs
  ): Promise<SwiggyToolResponse<{ restaurants: unknown[]; total?: number; nextOffset?: number }>> {
    return this.callTool('search_restaurants', params, 'food');
  }

  async getMenu(
    params: GetRestaurantMenuArgs
  ): Promise<SwiggyToolResponse<{ items: unknown[]; categories?: string[] }>> {
    return this.callTool('get_restaurant_menu', params, 'food');
  }

  async searchMenu(params: SearchMenuArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('search_menu', params, 'food');
  }

  async updateFoodCart(params: UpdateFoodCartArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('update_food_cart', params as unknown as Record<string, unknown>, 'food');
  }

  async getFoodCart(params: GetFoodCartArgs): Promise<SwiggyToolResponse<{
    items?: unknown[];
    total?: number;
    availablePaymentMethods?: string[];
  }>> {
    return this.callTool('get_food_cart', params, 'food');
  }

  async flushFoodCart(): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('flush_food_cart', {}, 'food');
  }

  async fetchFoodCoupons(params: {
    restaurantId: string;
    addressId: string;
    couponCode?: string;
  }): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('fetch_food_coupons', params, 'food');
  }

  async applyFoodCoupon(params: ApplyFoodCouponArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('apply_food_coupon', params, 'food');
  }

  async placeFoodOrder(
    params: PlaceFoodOrderArgs
  ): Promise<SwiggyToolResponse<{ orderId: string; status: string; total?: number }>> {
    return this.callTool('place_food_order', {
      addressId: params.addressId,
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    }, 'food');
  }

  async getFoodOrders(): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('get_food_orders', {}, 'food');
  }

  async getFoodOrderDetails(params: { orderId: string }): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('get_food_order_details', params, 'food');
  }

  async trackFoodOrder(params: TrackFoodOrderArgs = {}): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('track_food_order', params as Record<string, unknown>, 'food');
  }

  async reportFoodError(params: Record<string, unknown> = {}): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('report_error', params, 'food');
  }

  // ─── Instamart ────────────────────────────────────────────────────────────

  async createAddress(params: CreateAddressArgs): Promise<SwiggyToolResponse<{ id?: string; addressId?: string }>> {
    return this.callTool('create_address', params as unknown as Record<string, unknown>, 'instamart');
  }

  async deleteAddress(params: DeleteAddressArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('delete_address', params, 'instamart');
  }

  async searchInstamartProducts(
    params: SearchProductsArgs
  ): Promise<SwiggyToolResponse<{ products: unknown[]; total?: number }>> {
    return this.callTool('search_products', params, 'instamart');
  }

  async yourGoToItems(params: YourGoToItemsArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('your_go_to_items', params, 'instamart');
  }

  async updateInstamartCart(params: UpdateCartArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('update_cart', params as unknown as Record<string, unknown>, 'instamart');
  }

  async getInstamartCart(): Promise<SwiggyToolResponse<{
    items?: unknown[];
    total?: number;
    availablePaymentMethods?: string[];
  }>> {
    return this.callTool('get_cart', {}, 'instamart');
  }

  async clearInstamartCart(): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('clear_cart', {}, 'instamart');
  }

  async placeInstamartOrder(
    params: CheckoutArgs
  ): Promise<SwiggyToolResponse<{ orderId: string; status: string; total?: number }>> {
    return this.callTool('checkout', {
      addressId: params.addressId,
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    }, 'instamart');
  }

  async getInstamartOrders(): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('get_orders', {}, 'instamart');
  }

  async getInstamartOrderDetails(params: GetOrderDetailsArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('get_order_details', params, 'instamart');
  }

  async trackInstamartOrder(params: TrackOrderArgs): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('track_order', params as unknown as Record<string, unknown>, 'instamart');
  }

  async reportInstamartError(params: Record<string, unknown> = {}): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('report_error', params, 'instamart');
  }
}
