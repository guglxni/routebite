/**
 * Argument types aligned to Builders Club tool schemas.
 * Source: https://mcp.swiggy.com/builders/docs/reference/{food,instamart}/*.md
 * Do not invent fields — extend only after fetching the relevant .md page.
 */

// ─── Food ────────────────────────────────────────────────────────────────────

export type SearchRestaurantsArgs = {
  addressId: string;
  query: string;
  offset?: number;
};

export type GetRestaurantMenuArgs = {
  addressId: string;
  restaurantId: string;
  page?: number;
  pageSize?: number;
};

export type SearchMenuArgs = {
  addressId: string;
  query: string;
  restaurantIdOfAddedItem?: string;
  vegFilter?: 0 | 1;
  offset?: number;
};

/** Cart line — live items may use variants XOR variantsV2 (never both). */
export type FoodCartItem = {
  itemId?: string;
  menuItemId?: string;
  quantity: number;
  variants?: unknown;
  variantsV2?: unknown;
  variations?: unknown;
  addons?: unknown[];
  addOns?: unknown[];
  variantId?: string;
  [key: string]: unknown;
};

export type UpdateFoodCartArgs = {
  restaurantId: string;
  cartItems: FoodCartItem[];
  addressId: string;
  restaurantName?: string;
};

export type GetFoodCartArgs = {
  addressId: string;
  restaurantName?: string;
};

export type ApplyFoodCouponArgs = {
  couponCode: string;
  addressId: string;
  cartId?: string;
};

export type PlaceFoodOrderArgs = {
  addressId: string;
  paymentMethod?: string;
};

export type TrackFoodOrderArgs = {
  orderId?: string;
};

// ─── Instamart ───────────────────────────────────────────────────────────────

export type CreateAddressArgs = {
  fullAddress: string;
  addressLine: string;
  addressLine2: string;
  locality?: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  addressCategory: 'HOME' | 'WORK' | 'OFFICE' | 'FRIENDS_AND_FAMILY' | 'OTHER';
  addressTag?: string;
  userName: string;
  userPhone: string;
  receiverName?: string;
  receiverPhone?: string;
};

export type SearchProductsArgs = {
  addressId: string;
  query: string;
  offset?: number;
};

export type YourGoToItemsArgs = {
  addressId: string;
};

export type InstamartCartItem = {
  spinId: string;
  quantity: number;
};

export type UpdateCartArgs = {
  selectedAddressId: string;
  items: InstamartCartItem[];
};

export type CheckoutArgs = {
  addressId: string;
  paymentMethod?: string;
};

export type TrackOrderArgs = {
  orderId: string;
  lat: number;
  lng: number;
};

export type GetOrderDetailsArgs = {
  orderId: string;
};

export type DeleteAddressArgs = {
  addressId: string;
};
