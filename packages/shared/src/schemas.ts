// ─────────────────────────────────────────────────────────────────────────────
// RouteBite Zod Validation Schemas
// Shared between frontend and backend for runtime validation
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─── Enum Schemas ────────────────────────────────────────────────────────────

export const TransportModeSchema = z.enum(['bus', 'train', 'car', 'bike', 'metro', 'walk']);

export const InterceptTypeSchema = z.enum(['traffic_light', 'stop', 'petrol_pump', 'toll_plaza', 'dynamic']);

export const ServerTypeSchema = z.enum(['food', 'instamart']);

export const OrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'failed',
]);

export const AlignmentLevelSchema = z.enum(['excellent', 'good', 'fair', 'poor']);

export const TimingTypeSchema = z.enum(['now', 'auto']);

export const JourneyStatusSchema = z.enum(['active', 'completed', 'cancelled']);

export const PortalRoleSchema = z.enum(['user', 'rider', 'admin']);

export const PortalLoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

// ─── Geo Schemas ─────────────────────────────────────────────────────────────

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const AddressSchema = z.object({
  formatted: z.string().min(1),
  landmark: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
});

export const GPSPositionSchema = LatLngSchema.extend({
  accuracy: z.number().positive().optional(),
  timestamp: z.number().int().nonnegative(),
});

// ─── Vehicle Schemas ─────────────────────────────────────────────────────────

export const VehicleDetailsSchema = z.object({
  plateNumber: z.string().max(20).optional(),
  color: z.string().max(40).optional(),
  model: z.string().max(80).optional(),
  description: z.string().min(1).max(200),
  busRouteNumber: z.string().max(40).optional(),
  busOperator: z.string().max(80).optional(),
  trainNumber: z.string().regex(/^\d{5}$/, 'Train number must be 5 digits').optional(),
  trainName: z.string().max(80).optional(),
  coach: z.string().max(20).optional(),
  seatBerth: z.string().max(20).optional(),
  liveLocationSharing: z.boolean().optional(),
  liveLocation: GPSPositionSchema.optional(),
  trainRunSnapshot: z
    .object({
      startDate: z.string(),
      trainName: z.string().optional(),
      updatedAt: z.string(),
    })
    .optional(),
});

// ─── Journey Schemas ─────────────────────────────────────────────────────────

export const JourneyInputSchema = z.object({
  origin: z.string().min(1).max(500),
  destination: z.string().min(1).max(500),
  transportMode: TransportModeSchema,
  vehicleDetails: VehicleDetailsSchema,
});

export const JourneySchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int().positive().optional(),
  origin: AddressSchema,
  destination: AddressSchema,
  transportMode: TransportModeSchema,
  vehicleDetails: VehicleDetailsSchema,
  routePolyline: z.string(),
  status: JourneyStatusSchema,
  createdAt: z.string().datetime(),
});

// ─── Route Analysis ──────────────────────────────────────────────────────────

export const InterceptPointSchema = z.object({
  id: z.string().uuid(),
  journeyId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  type: InterceptTypeSchema,
  score: z.number().int().min(0).max(100),
  estimatedDwellTime: z.number().int().nonnegative(),
  restaurantCount: z.number().int().nonnegative().optional(),
  safetyRating: z.number().min(0).max(5).optional(),
  name: z.string().optional(),
});

export const RouteAnalysisSchema = z.object({
  journeyId: z.string().uuid(),
  routePolyline: z.array(LatLngSchema),
  intercepts: z.array(InterceptPointSchema),
  estimatedDuration: z.number().int().nonnegative(),
});

// ─── Restaurant / Food Schemas ───────────────────────────────────────────────

export const RestaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuisine: z.array(z.string()),
  rating: z.number().min(0).max(5),
  etaFromIntercept: z.number().positive(),
  distance: z.number().nonnegative(),
  imageUrl: z.string().url().optional(),
  isOpen: z.boolean(),
});

export const ItemVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().int().nonnegative(),
});

export const AddonSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().int().nonnegative(),
});

export const MenuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().int().nonnegative(),
  imageUrl: z.string().url().optional(),
  variants: z.array(ItemVariantSchema),
  addons: z.array(AddonSchema),
  isVeg: z.boolean(),
  category: z.enum(['recommended', 'bestseller', 'regular']),
});

export const FoodCartItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  variantId: z.string().optional(),
  variantName: z.string().optional(),
  addonIds: z.array(z.string()),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
});

export const FoodCartSchema = z.object({
  restaurantId: z.string(),
  restaurantName: z.string(),
  items: z.array(FoodCartItemSchema),
  total: z.number().int().nonnegative(),
});

// ─── Instamart Schemas ───────────────────────────────────────────────────────

export const SizeVariantSchema = z.object({
  id: z.string(),
  size: z.string(),
  price: z.number().int().nonnegative(),
});

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.string(),
  price: z.number().int().nonnegative(),
  sizeVariants: z.array(SizeVariantSchema),
  imageUrl: z.string().url().optional(),
  inStock: z.boolean(),
  labels: z.array(z.enum(['veg', 'organic', 'gluten_free'])),
});

export const InstamartCartItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  variantId: z.string(),
  variantSize: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
});

export const InstamartCartSchema = z.object({
  items: z.array(InstamartCartItemSchema),
  total: z.number().int().nonnegative(),
});

// ─── Order Schemas ───────────────────────────────────────────────────────────

export const OrderInputSchema = z.object({
  interceptId: z.string().uuid(),
  foodCart: FoodCartSchema.optional(),
  instamartCart: InstamartCartSchema.optional(),
  timing: TimingTypeSchema,
}).refine(
  (data) => data.foodCart || data.instamartCart,
  { message: 'At least one cart must be provided' }
);

export const OrderResultSchema = z.object({
  orderId: z.string().uuid(),
  swiggyOrderId: z.string().optional(),
  status: OrderStatusSchema,
  server: ServerTypeSchema,
  estimatedInterceptTime: z.string().datetime(),
  totalAmount: z.number().int().nonnegative(),
});

export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int().positive().optional(),
  journeyId: z.string().uuid().optional(),
  interceptId: z.string().uuid().optional(),
  swiggyOrderId: z.string().optional(),
  server: ServerTypeSchema,
  status: OrderStatusSchema,
  totalAmount: z.number().int().nonnegative(),
  timingType: TimingTypeSchema,
  placedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

// ─── Tracking Schemas ────────────────────────────────────────────────────────

export const AlignmentStatusSchema = z.object({
  status: AlignmentLevelSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  customerETA: z.number().int().nonnegative(),
  riderETA: z.number().int().nonnegative(),
  orderReadyTime: z.number().int().nonnegative(),
  recommendation: z.string().optional(),
});

export const TrackingUpdateSchema = z.object({
  customerETA: z.number().int().nonnegative(),
  riderETA: z.number().int().nonnegative(),
  orderStatus: OrderStatusSchema,
  alignmentStatus: AlignmentStatusSchema,
});

// ─── OAuth Schemas ───────────────────────────────────────────────────────────

export const TokenSetSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});

export const PKCEPairSchema = z.object({
  codeVerifier: z.string(),
  codeChallenge: z.string(),
  state: z.string(),
});

// ─── API Response Schemas ────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: ApiErrorSchema.optional(),
  });
