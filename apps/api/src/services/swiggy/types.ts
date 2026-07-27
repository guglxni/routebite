import type { ApiResponse } from '@routebite/shared/types';

// ─── MCP Tool Names (Builders Club reference — do not invent) ───────────────
// Food: https://mcp.swiggy.com/builders/docs/reference/food/index.md (14)
// Instamart: https://mcp.swiggy.com/builders/docs/reference/instamart/index.md (13)

export type FoodTool =
  | 'get_addresses'
  | 'search_restaurants'
  | 'get_restaurant_menu'
  | 'search_menu'
  | 'update_food_cart'
  | 'get_food_cart'
  | 'flush_food_cart'
  | 'fetch_food_coupons'
  | 'apply_food_coupon'
  | 'place_food_order'
  | 'get_food_orders'
  | 'get_food_order_details'
  | 'track_food_order'
  | 'report_error';

export type InstamartTool =
  | 'get_addresses'
  | 'create_address'
  | 'delete_address'
  | 'search_products'
  | 'your_go_to_items'
  | 'update_cart'
  | 'get_cart'
  | 'clear_cart'
  | 'checkout'
  | 'get_orders'
  | 'get_order_details'
  | 'track_order'
  | 'report_error';

export type SwiggyTool = FoodTool | InstamartTool;

export type SwiggyServer = 'food' | 'instamart';

/** Live MCP path segment — Instamart is `/im`, not `/instamart`. */
export function swiggyServerPath(server: SwiggyServer): 'food' | 'im' {
  return server === 'instamart' ? 'im' : 'food';
}

// ─── Tool Request/Response ───────────────────────────────────────────────────

export interface SwiggyToolRequest {
  tool: SwiggyTool;
  params: Record<string, unknown>;
}

export type SwiggyToolResponse<T = unknown> = ApiResponse<T>;

// ─── OAuth ───────────────────────────────────────────────────────────────────

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface OAuthError {
  error: string;
  error_description?: string;
}

// ─── Swiggy Error Classification ─────────────────────────────────────────────

export type SwiggyErrorType =
  | 'auth' // 401 — needs re-authentication
  | 'rate_limit' // 429 — back off
  | 'server' // 5xx — retry with backoff
  | 'client' // 4xx (not 401) — bad request, don't retry
  | 'network' // fetch failure — retry
  | 'unknown';

export interface ClassifiedError {
  type: SwiggyErrorType;
  retryable: boolean;
  statusCode?: number;
  message: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SwiggyClientConfig {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

// Default config from env
export const defaultConfig: SwiggyClientConfig = {
  baseUrl: process.env.SWIGGY_MCP_BASE ?? 'http://localhost:8788',
  clientId: process.env.SWIGGY_CLIENT_ID ?? 'routebite-dev',
  redirectUri: process.env.SWIGGY_REDIRECT_URI ?? 'http://localhost:3000/auth/callback',
  scopes: ['mcp:tools', 'mcp:resources', 'mcp:prompts'],
};
