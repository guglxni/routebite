import type { LatLng, TransportMode, TimingType, OrderStatus, ServerType } from '@routebite/shared/types';

export interface PlaceOrderInput {
  userId: number;
  journeyId: string;
  interceptId: string;
  server: ServerType;
  timing: TimingType;
  // Food-specific
  restaurantId?: string;
  restaurantLocation?: LatLng; // Optional: real coordinates enable traffic-aware rider ETA
  foodItems?: Array<{
    menuItemId: string;
    variantId?: string;
    addonIds: string[];
    quantity: number;
  }>;
  // Instamart-specific
  productItems?: Array<{
    productId: string;
    variantId: string;
    quantity: number;
  }>;
  paymentMethod?: string;
  couponCode?: string;
}

export interface PlaceOrderResult {
  orderId: string;
  swiggyOrderId?: string;
  status: OrderStatus;
  totalAmount: number; // paise
  estimatedDeliveryTime?: string;
  interceptAddress: string;
  timing: TimingType;
  autoPlaceAt?: string; // ISO timestamp if timing == 'auto'
}

export interface GeneratedAddress {
  formatted: string;
  label: string;
  lat: number;
  lng: number;
}

export interface TimingCalculation {
  interceptETA: number;     // seconds from journey start
  prepTime: number;         // seconds (restaurant estimate)
  riderTravel: number;      // seconds (rider to intercept)
  safetyBuffer: number;     // seconds (10 min)
  trafficBuffer: number;    // seconds (5 min)
  weatherBuffer?: number;   // seconds (rain/alert at intercept)
  autoPlaceTime: number;    // seconds before interceptETA
  autoPlaceAt: Date;
}
