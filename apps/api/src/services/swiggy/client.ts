import type { SwiggyToolResponse, SwiggyTool, ClassifiedError } from './types';
import { defaultConfig } from './types';
import { classifyError, getRetryDelay, sleep } from './error-handler';
import { RETRY_STRATEGY } from '@routebite/shared/constants';

export class SwiggyMCPClient {
  private accessToken: string;
  private baseUrl: string;

  constructor(accessToken: string, baseUrl = defaultConfig.baseUrl) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
  }

  async callTool<T>(
    tool: SwiggyTool,
    params: Record<string, unknown>,
    server: 'food' | 'instamart' = 'food'
  ): Promise<SwiggyToolResponse<T>> {
    let lastError: ClassifiedError | undefined;

    for (let attempt = 0; attempt < RETRY_STRATEGY.MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/${server}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify({ tool, params }),
        });

        // Not JSON — likely a proxy/network error
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
        }

        const data = (await res.json()) as SwiggyToolResponse<T>;

        if (!res.ok) {
          const err = classifyError(new Error(data.error?.message ?? 'Unknown error'), res.status);
          if (!err.retryable) throw err;
          lastError = err;
        } else {
          return data;
        }
      } catch (err) {
        const classified = classifyError(err);
        if (!classified.retryable) throw new Error(classified.message);
        lastError = classified;
      }

      // Wait before retry (except last attempt)
      if (attempt < RETRY_STRATEGY.MAX_ATTEMPTS - 1) {
        await sleep(getRetryDelay(attempt));
      }
    }

    throw new Error(lastError?.message ?? 'Max retries exceeded');
  }

  // ─── Convenience wrappers ──────────────────────────────────────────────────

  async searchRestaurants(params: {
    addressId?: string;
    query?: string;
    lat?: number;
    lng?: number;
  }): Promise<SwiggyToolResponse<{ restaurants: unknown[]; total: number }>> {
    return this.callTool('search_restaurants', params, 'food');
  }

  async getMenu(params: { restaurantId: string }): Promise<SwiggyToolResponse<{ items: unknown[]; categories: string[] }>> {
    return this.callTool('get_restaurant_menu', params, 'food');
  }

  async updateFoodCart(params: { restaurantId: string; items: unknown[] }): Promise<SwiggyToolResponse<{ restaurantId: string; items: unknown[] }>> {
    return this.callTool('update_food_cart', params, 'food');
  }

  async getFoodCart(): Promise<SwiggyToolResponse<{ items: unknown[]; total: number }>> {
    return this.callTool('get_food_cart', {}, 'food');
  }

  async placeFoodOrder(params: { paymentMethod?: string }): Promise<SwiggyToolResponse<{ orderId: string; status: string; total: number }>> {
    return this.callTool('place_food_order', params, 'food');
  }

  async trackFoodOrder(params: { orderId: string }): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('track_food_order', params, 'food');
  }

  async getAddresses(): Promise<SwiggyToolResponse<unknown[]>> {
    return this.callTool('get_addresses', {}, 'food');
  }

  async searchInstamartProducts(params: { query?: string; lat?: number; lng?: number }): Promise<SwiggyToolResponse<{ products: unknown[]; total: number }>> {
    return this.callTool('search_instamart_products', params, 'instamart');
  }

  async updateInstamartCart(params: { items: unknown[] }): Promise<SwiggyToolResponse<{ items: unknown[] }>> {
    return this.callTool('update_instamart_cart', params, 'instamart');
  }

  async getInstamartCart(): Promise<SwiggyToolResponse<{ items: unknown[]; total: number }>> {
    return this.callTool('get_instamart_cart', {}, 'instamart');
  }

  async placeInstamartOrder(params: { paymentMethod?: string }): Promise<SwiggyToolResponse<{ orderId: string; status: string; total: number }>> {
    return this.callTool('place_instamart_order', params, 'instamart');
  }

  async trackInstamartOrder(params: { orderId: string }): Promise<SwiggyToolResponse<unknown>> {
    return this.callTool('track_instamart_order', params, 'instamart');
  }
}
