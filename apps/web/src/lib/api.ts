import { z } from "zod";
import {
  OrderStatusSchema,
  ServerTypeSchema,
  TimingTypeSchema,
  TransportModeSchema,
} from "@routebite/shared/schemas";
import type { OrderStatus, ServerType, TimingType } from "@routebite/shared/types";

const origin = typeof window !== "undefined" ? "" : "http://localhost:8787";

async function api<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown; noAuth?: boolean }
): Promise<T> {
  const token = localStorage.getItem("rb_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token && !opts?.noAuth) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${origin}/api/v1${path}`, {
    method: opts?.method ?? "GET",
    headers,
    credentials: "include",
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const msg = (data.error as Record<string, unknown>)?.message ?? res.statusText;
    const code = (data.error as Record<string, unknown>)?.code ?? "UNKNOWN";
    const err = new Error(`${code}: ${msg}`);
    (err as Error & { statusCode: number; code: string }).statusCode = res.status;
    (err as Error & { statusCode: number; code: string }).code = code as string;
    throw err;
  }
  return (data as { data: T }).data;
}

/* ───
   DTO Schemas
   These validate the wire format returned by our backend, which uses flat
   address fields (originAddress / originLat / originLng) instead of the
   nested Address objects defined in @routebite/shared/types. Import shared
   enum schemas for runtime validation of discriminated fields.
   ─── */

export const UserSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const InterceptPointSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  type: z.string(),
  score: z.number(),
  dwellTime: z.number(),
  restaurantCount: z.number(),
  safetyRating: z.number(),
});

export const JourneySchema = z.object({
  id: z.string(),
  originAddress: z.string(),
  originLat: z.number(),
  originLng: z.number(),
  destinationAddress: z.string(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  transportMode: z.string(),
  estimatedDuration: z.number().optional(),
  intercepts: z.array(InterceptPointSchema).optional(),
});

export const OrderSchema = z.object({
  id: z.string(),
  swiggyOrderId: z.string().optional(),
  server: ServerTypeSchema,
  status: OrderStatusSchema,
  totalAmount: z.number(),
  timingType: TimingTypeSchema,
  interceptAddress: z.string().optional(),
  placedAt: z.string().optional(),
  autoPlaceAt: z.string().optional(),
  createdAt: z.string().optional(),
  journeyId: z.string().optional(),
  interceptId: z.string().optional(),
});

export const TrackingEventSchema = z.object({
  id: z.number(),
  orderId: z.string(),
  riderLat: z.number().optional(),
  riderLng: z.number().optional(),
  customerETA: z.number().optional(),
  riderETA: z.number().optional(),
  alignmentScore: z.number().optional(),
  recordedAt: z.string().nullable(),
});

export const AlignmentStatusSchema = z.object({
  status: z.string(),
  color: z.string(),
  customerETA: z.number(),
  riderETA: z.number(),
  orderReadyTime: z.number(),
  recommendation: z.string().optional(),
  score: z.number(),
});

// ─── API helpers ────────────────────────────────────────────────────────────

export const getHealth = () => api<{ status: string; timestamp: string }>("/health", { noAuth: true });

export const getMe = () => api<z.infer<typeof UserSchema>>("/user/me");

export const getAuthUrl = () =>
  api<{ authorizationUrl: string; state: string }>("/auth/swiggy", { noAuth: true }).then(d => ({
    url: d.authorizationUrl,
    state: d.state,
  }));

export const analyzeRoute = (body: {
  origin: string;
  destination: string;
  transportMode: string;
  vehicleDetails?: { description: string; plateNumber?: string; color?: string };
  validateAddresses?: boolean;
}) =>
  api<{
    journeyId: string;
    distanceMeters: number;
    durationSeconds: number;
    interceptCount: number;
    hasTolls: boolean;
    weatherWarnings: Array<{ lat: number; lng: number; title: string }>;
  }>("/routes/analyze", { method: "POST", body: {
    ...body,
    vehicleDetails: body.vehicleDetails ?? { description: "RouteBite journey" },
  }});

export const getJourney = (journeyId: string) =>
  api<{
    id: string;
    originAddress: string;
    originLat: number;
    originLng: number;
    destinationAddress: string;
    destinationLat: number;
    destinationLng: number;
    transportMode: string;
    estimatedDuration: number;
    routePolyline: string | null;
    routePoints: Array<{ lat: number; lng: number }>;
    interceptCount: number;
  }>(`/routes/${journeyId}`);

export const postJourney = (body: {
  originAddress: string;
  destinationAddress: string;
  transportMode: string;
}) =>
  analyzeRoute({
    origin: body.originAddress,
    destination: body.destinationAddress,
    transportMode: body.transportMode,
  }).then(async (analysis) => {
    const journey = await getJourney(analysis.journeyId);
    return {
      ...journey,
      distanceMeters: analysis.distanceMeters,
      durationSeconds: analysis.durationSeconds,
      hasTolls: analysis.hasTolls,
      weatherWarnings: analysis.weatherWarnings,
    };
  });

export const getIntercepts = (journeyId: string) =>
  api<z.infer<typeof InterceptPointSchema>[]>(`/routes/${journeyId}/intercepts`);

export const getRestaurants = (interceptId: string) =>
  api<{ interceptId: string; restaurants: unknown[] }>(`/intercepts/${interceptId}/restaurants`);

export const getRestaurantMenu = (interceptId: string, restaurantId: string) =>
  api<{ interceptId: string; restaurantId: string; items: unknown[]; categories: string[] }>(
    `/intercepts/${interceptId}/menu/${restaurantId}`
  );

export const getProducts = (interceptId: string) =>
  api<{ interceptId: string; products: unknown[] }>(`/intercepts/${interceptId}/products`);

export const postOrder = (body: {
  journeyId: string;
  interceptId: string;
  server: ServerType;
  timing: TimingType;
  restaurantId?: string;
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
}) => api<z.infer<typeof OrderSchema>>("/orders", { method: "POST", body });

export const getOrders = () => api<z.infer<typeof OrderSchema>[]>("/orders");

export const getOrder = (id: string) => api<z.infer<typeof OrderSchema>>(`/orders/${id}`);

export const getOrderTrack = (id: string) =>
  api<{
    orderId: string;
    status: OrderStatus;
    swiggyOrderId: string | null;
    customerETA?: number;
    riderETA?: number;
    riderPosition?: { lat: number; lng: number };
    alignmentStatus: {
      status: string;
      color: string;
      customerETA: number;
      riderETA: number;
      orderReadyTime: number;
      recommendation?: string;
      score: number;
    } | null;
    raw?: unknown;
  }>(`/orders/${id}/track`);

export const getOrderTrackingHistory = (id: string, limit?: number) =>
  api<z.infer<typeof TrackingEventSchema>[]>(`/orders/${id}/tracking-history${limit ? `?limit=${limit}` : ""}`);

export const deleteOrder = (id: string) => api<unknown>(`/orders/${id}`, { method: "DELETE" });
