import { z } from "zod";
import {
  OrderStatusSchema,
  ServerTypeSchema,
  TimingTypeSchema,
  TransportModeSchema,
} from "@routebite/shared/schemas";
import type {
  GPSPosition,
  OrderStatus,
  PortalRole,
  ServerType,
  TimingType,
  VehicleDetails,
} from "@routebite/shared/types";
import { PortalRoleSchema } from "@routebite/shared/schemas";

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
    // Broadcast Swiggy re-auth so UI can show Reconnect CTA
    if (
      typeof window !== "undefined" &&
      (code === "SWIGGY_REAUTH_REQUIRED" ||
        (res.status === 401 && String(msg).toLowerCase().includes("swiggy")))
    ) {
      window.dispatchEvent(
        new CustomEvent("routebite:swiggy-reauth", { detail: { code, message: msg } })
      );
    }
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
  role: PortalRoleSchema.default("user"),
  username: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().optional(),
  homePath: z.string().optional(),
});

export type PortalAccountHint = {
  username: string;
  password: string;
  role: PortalRole;
  name: string;
  homePath: string;
};

const IsochroneGeometrySchema = z
  .object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.any()),
  })
  .passthrough();

export const InterceptReachabilitySchema = z
  .object({
    riderBudgetSeconds: z.number(),
    walkBudgetSeconds: z.number(),
    reachableRestaurantCount: z.number(),
    circularRestaurantCount: z.number().optional(),
    riderAreaM2: z.number().optional(),
    isochroneOk: z.boolean(),
    riderIsochrone: IsochroneGeometrySchema.optional(),
    walkIsochrone: IsochroneGeometrySchema.optional(),
    travelMode: z.string().optional(),
    travelDirection: z.string().optional(),
  })
  .passthrough();

export const InterceptPointSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  type: z.string(),
  score: z.number(),
  dwellTime: z.number(),
  restaurantCount: z.number(),
  reachableRestaurantCount: z.number().optional(),
  safetyRating: z.number(),
  name: z.string().optional(),
  etaSeconds: z.number().optional(),
  stationCode: z.string().optional(),
  reachability: InterceptReachabilitySchema.optional(),
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

export const getPortalInfo = () =>
  api<{
    mode: string;
    notice: string;
    accounts: PortalAccountHint[];
  }>("/auth/portal", { noAuth: true });

export const portalLogin = (username: string, password: string) =>
  api<{
    token: string;
    expiresIn: number;
    role: PortalRole;
    name: string;
    email: string;
    username: string;
    homePath: string;
  }>("/auth/login", { method: "POST", body: { username, password }, noAuth: true });

export const portalLogout = () =>
  api<{ ok: boolean }>("/auth/logout", { method: "POST" }).catch(() => ({ ok: true }));

// ─── Rider APIs ──────────────────────────────────────────────────────────────

export type RiderPresence = "offline" | "online" | "busy";

export type RiderDelivery = {
  id: string;
  status: OrderStatus;
  server: ServerType;
  totalAmount: number;
  timingType: TimingType;
  journeyId: string | null;
  interceptId: string | null;
  riderId: number | null;
  assignedToMe: boolean;
  dropoff: { lat: number | null; lng: number | null; name: string; score?: number | null };
  journey: {
    originAddress: string | null;
    destAddress: string | null;
    originLat?: number | null;
    originLng?: number | null;
    destLat?: number | null;
    destLng?: number | null;
    estimatedDuration?: number | null;
  } | null;
  createdAt: string | null;
};

export const getRiderStats = () =>
  api<{
    activeDeliveries: number;
    deliveredTotal: number;
    availableJobs: number;
    presence: RiderPresence;
    riderId: number;
    name: string | null;
  }>("/rider/stats");

export const getRiderMe = () =>
  api<{
    id: number;
    presence: RiderPresence;
    lastLocation: { lat: number; lng: number; at: string | null } | null;
    name: string | null;
    username: string | null;
  }>("/rider/me");

export const patchRiderPresence = (presence: RiderPresence) =>
  api<{ presence: RiderPresence }>("/rider/presence", { method: "PATCH", body: { presence } });

export const getRiderJobs = () => api<RiderDelivery[]>("/rider/jobs");

export const getRiderDeliveries = (scope: "mine" | "available" | "all" = "mine") =>
  api<RiderDelivery[]>(`/rider/deliveries?scope=${scope}`);

export const getRiderHistory = () => api<RiderDelivery[]>("/rider/history");

export const getRiderDelivery = (id: string) =>
  api<{
    order: Record<string, unknown>;
    journey: Record<string, unknown> | null;
    intercept: Record<string, unknown> | null;
    tracking: Array<Record<string, unknown>>;
    routePoints: Array<{ lat: number; lng: number }>;
    assignedToMe: boolean;
    lastRiderPosition: { lat: number; lng: number; eta: number | null } | null;
    mapsUrl: string | null;
    amountRupees?: number;
    fusion?: {
      riderBrief: string | null;
      mealQueryHint: string | null;
      haltGate: {
        ok: boolean;
        severity: string;
        message: string;
        recommendation?: string;
      } | null;
      autoPlaceAt: string | null;
      timingType: string;
      alignment: {
        status: string;
        color: string;
        customerETA: number;
        riderETA: number;
        orderReadyTime?: number;
        recommendation?: string;
        score: number;
      } | null;
      deferredPending: boolean;
    };
  }>(`/rider/deliveries/${id}`);

export const claimRiderDelivery = (id: string) =>
  api<{ id: string; riderId: number }>(`/rider/deliveries/${id}/claim`, { method: "POST" });

export const releaseRiderDelivery = (id: string) =>
  api<{ id: string; riderId: null }>(`/rider/deliveries/${id}/release`, { method: "POST" });

export const patchRiderLocation = (
  id: string,
  body: { lat: number; lng: number; riderETA?: number }
) =>
  api<{ riderETA: number | null; riderPosition: { lat: number; lng: number } }>(
    `/rider/deliveries/${id}/location`,
    { method: "PATCH", body }
  );

export const patchRiderFleetLocation = (body: { lat: number; lng: number; riderETA?: number }) =>
  api<{ lat: number; lng: number; pingedOrders: string[]; riderETA: number | null }>(
    "/rider/location",
    {
      method: "PATCH",
      body,
    },
  );

export const patchRiderStatus = (
  id: string,
  status: "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled"
) => api(`/rider/deliveries/${id}/status`, { method: "PATCH", body: { status } });

// ─── Admin APIs ──────────────────────────────────────────────────────────────

export const getAdminOverview = () =>
  api<{
    users: number;
    journeys: number;
    orders: number;
    activeOrders: number;
    unassignedOrders: number;
    ridersOnline: number;
    deliveredOrders: number;
    avgAlignmentScore: number | null;
    usersByRole: Array<{ role: string; count: number }>;
    generatedAt: string;
  }>("/admin/overview");

export const getAdminFleet = () =>
  api<
    Array<{
      id: number;
      name: string | null;
      username: string | null;
      presence: RiderPresence;
      activeJobs: number;
      location: { lat: number; lng: number; at: string | null } | null;
    }>
  >("/admin/fleet");

export const getAdminUsers = () =>
  api<
    Array<{
      id: number;
      username: string | null;
      email: string | null;
      name: string | null;
      role: PortalRole;
      riderPresence: RiderPresence | null;
      sessionActive: boolean;
      createdAt: string | null;
    }>
  >("/admin/users");

export const patchAdminUser = (
  id: number,
  body: { role?: PortalRole; revokeSession?: boolean }
) => api<{ id: number; role: string; sessionRevoked: boolean }>(`/admin/users/${id}`, {
  method: "PATCH",
  body,
});

export const getAdminOrders = (limit = 40, status?: string) =>
  api<
    Array<{
      id: string;
      userId: number | null;
      riderId: number | null;
      status: string;
      server: string;
      totalAmount: number;
      timingType: string;
      journeyId: string | null;
      createdAt: string | null;
      dropoff: { lat: number | null; lng: number | null; name: string | null } | null;
    }>
  >(`/admin/orders?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`);

export const patchAdminOrder = (
  id: string,
  body: { status?: string; riderId?: number | null }
) => api<Record<string, unknown>>(`/admin/orders/${id}`, { method: "PATCH", body });

export const getAdminJourneys = (limit = 40) =>
  api<
    Array<{
      id: string;
      userId: number | null;
      originAddress: string;
      destAddress: string;
      originLat: number;
      originLng: number;
      destLat: number;
      destLng: number;
      transportMode: string;
      status: string;
      estimatedDuration: number | null;
      createdAt: string | null;
    }>
  >(`/admin/journeys?limit=${limit}`);

export const getAdminTrackingRecent = () =>
  api<
    Array<{
      id: number;
      orderId: string;
      riderLat: number | null;
      riderLng: number | null;
      customerLat: number | null;
      customerLng: number | null;
      riderETA: number | null;
      alignmentScore: number | null;
      recordedAt: string | null;
    }>
  >("/admin/tracking/recent");

export const getAdminHealthDetail = () =>
  api<{
    database: string;
    portalMode: string;
    adminUserId: number;
    activeOrders: number;
    apiTime: string;
  }>("/admin/health-detail");

export const analyzeRoute = (body: {
  origin: string;
  destination: string;
  transportMode: string;
  vehicleDetails?: VehicleDetails;
  validateAddresses?: boolean;
  departureTime?: string;
}) =>
  api<{
    journeyId: string;
    distanceMeters: number;
    durationSeconds: number;
    interceptCount: number;
    hasTolls: boolean;
    weatherWarnings: Array<{ lat: number; lng: number; title: string }>;
    outdoorConditions?: OutdoorConditionsDto | null;
    trainRun?: {
      trainNumber: string;
      trainName?: string;
      startDate: string;
      stationCount: number;
      upcomingStops: number;
    };
  }>("/routes/analyze", {
    method: "POST",
    body: {
      ...body,
      // Traffic-aware Routes: default departure ~now (+buffer server-side if omitted)
      departureTime: body.departureTime ?? new Date(Date.now() + 120_000).toISOString(),
      vehicleDetails: body.vehicleDetails ?? { description: "RouteBite journey" },
    },
  });

export type OutdoorConditionsDto = {
  lat: number;
  lng: number;
  source: "google_maps_platform";
  verified: true;
  fetchedAt: string;
  severity: "good" | "watch" | "alert";
  airQuality?: {
    uaqi?: number;
    category?: string;
    dominantPollutant?: string;
    local?: {
      code: string;
      displayName?: string;
      aqi?: number;
      category?: string;
      dominantPollutant?: string;
    };
    source: string;
  };
  weather?: {
    condition?: string;
    temperatureC?: number;
    feelsLikeC?: number;
    precipProbability?: number;
    humidityPercent?: number;
    windKph?: number;
    hourlyPrecipProbability?: number;
    thunderstormProbability?: number;
    source: string;
  };
  pollen?: {
    maxIndex?: number;
    plantDescriptions?: string[];
    unavailable?: boolean;
    source: string;
  };
  advisories: Array<{
    kind: "air" | "weather" | "pollen" | "alert";
    title: string;
    severity: "good" | "watch" | "alert";
  }>;
  warningTitles: string[];
};

export type OptimizeWaypoint = {
  lat: number;
  lng: number;
  name?: string;
  type: "origin" | "destination" | "pickup" | "delivery";
  dwellMinutes?: number;
};

export type OptimizedRouteResult = {
  optimizedOrder: number[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  solver: string;
  legs: Array<{
    fromIndex: number;
    toIndex: number;
    durationSeconds: number;
    distanceMeters: number;
    polyline: string;
  }>;
};

/** Multi-stop waypoint order (Routes optimizeWaypointOrder + local fallbacks). */
export const optimizeRoute = (body: {
  waypoints: OptimizeWaypoint[];
  transportMode?: string;
}) =>
  api<OptimizedRouteResult>("/routes/optimize", { method: "POST", body });

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
    vehicleDetails?: VehicleDetails | null;
  }>(`/routes/${journeyId}`);

export const patchJourneyTelemetry = (
  journeyId: string,
  body: {
    vehicleDetails?: Partial<VehicleDetails>;
    liveLocation?: GPSPosition;
    liveLocationSharing?: boolean;
  },
) =>
  api<{ vehicleDetails: VehicleDetails }>(`/routes/${journeyId}/telemetry`, {
    method: "PATCH",
    body,
  });

export const getTrainLiveStatus = (trainNumber: string) =>
  api<{
    trainNumber: string;
    trainName?: string;
    lastKnownStation?: string;
    lastEventAt?: string;
    delayMinutes?: number;
    status?: string;
    currentStationCode?: string;
    nextStation?: string;
    platform?: string;
    startDate?: string;
    source: "ntes" | "unavailable";
    fallbackUrl: string;
    note?: string;
  }>(`/railways/trains/${trainNumber}/status`);

export const getTrainRun = (trainNumber: string) =>
  api<{
    trainNumber: string;
    trainName?: string;
    lastKnownStation?: string;
    delayMinutes?: number;
    status?: string;
    nextStation?: string;
    startDate?: string;
    source: "ntes" | "unavailable";
    fallbackUrl: string;
    note?: string;
    run: {
      trainNumber: string;
      trainName?: string;
      startDate: string;
      delayMinutes?: number;
      currentStationCode?: string;
      currentStationName?: string;
      nextStationCode?: string;
      nextStationName?: string;
      lastUpdate?: string;
      stations: Array<{
        stationCode: string;
        stationName: string;
        platform?: string;
        expectedArrival?: string;
        expectedDeparture?: string;
        haltSeconds: number;
        etaSeconds?: number;
        passed: boolean;
        arrivalDelay?: string;
        departureDelay?: string;
      }>;
      updatedAt: string;
      source: "ntes" | "unavailable";
      fallbackUrl: string;
    };
  }>(`/railways/trains/${trainNumber}/run`);

export const postJourney = (body: {
  originAddress: string;
  destinationAddress: string;
  transportMode: string;
  vehicleDetails?: VehicleDetails;
  liveLocationSharing?: boolean;
}) =>
  analyzeRoute({
    origin: body.originAddress,
    destination: body.destinationAddress,
    transportMode: body.transportMode,
    vehicleDetails: {
      ...(body.vehicleDetails ?? { description: "RouteBite journey" }),
      liveLocationSharing: body.liveLocationSharing,
    },
  }).then(async (analysis) => {
    const journey = await getJourney(analysis.journeyId);
    return {
      ...journey,
      distanceMeters: analysis.distanceMeters,
      durationSeconds: analysis.durationSeconds,
      hasTolls: analysis.hasTolls,
      weatherWarnings: analysis.weatherWarnings,
      outdoorConditions: analysis.outdoorConditions ?? null,
    };
  });

export const getIntercepts = (journeyId: string) =>
  api<z.infer<typeof InterceptPointSchema>[]>(`/routes/${journeyId}/intercepts`);

export const getRestaurants = (interceptId: string, opts?: { q?: string; customerEta?: number }) => {
  const q = new URLSearchParams();
  if (opts?.q) q.set("q", opts.q);
  if (opts?.customerEta != null) q.set("customerEta", String(opts.customerEta));
  const qs = q.toString();
  return api<{
    interceptId: string;
    restaurants: unknown[];
    mealHint?: {
      slot: string;
      label: string;
      primaryQuery: string;
      hint: string;
      queries: string[];
    };
    deepen?: { shrunk: boolean; note: string; customerEtaSeconds: number } | null;
    reachability?: z.infer<typeof InterceptReachabilitySchema>;
  }>(`/intercepts/${interceptId}/restaurants${qs ? `?${qs}` : ""}`);
};

export const getInterceptReachability = (interceptId: string) =>
  api<{
    interceptId: string;
    lat: number;
    lng: number;
    reachability: z.infer<typeof InterceptReachabilitySchema> | null;
  }>(`/intercepts/${interceptId}/reachability`);

export const getRestaurantMenu = (interceptId: string, restaurantId: string) =>
  api<{ interceptId: string; restaurantId: string; items: unknown[]; categories: string[] }>(
    `/intercepts/${interceptId}/menu/${restaurantId}`
  );

export const getProducts = (interceptId: string, query?: string) =>
  api<{ interceptId: string; products: unknown[] }>(
    `/intercepts/${interceptId}/products${query ? `?q=${encodeURIComponent(query)}` : ""}`
  );

export const searchMenuDishes = (interceptId: string, q: string, restaurantId?: string) => {
  const params = new URLSearchParams({ q });
  if (restaurantId) params.set("restaurantId", restaurantId);
  return api<{
    interceptId: string;
    query: string;
    restaurantId: string | null;
    items: unknown[];
    total: number;
  }>(`/intercepts/${interceptId}/menu-search?${params}`);
};

export const getGoToItems = (interceptId: string) =>
  api<{ interceptId: string; addressId: string; products: unknown[] }>(
    `/intercepts/${interceptId}/go-to`
  );

export type CorridorCoverage = {
  interceptId: string;
  lat: number;
  lng: number;
  addressId: string | null;
  food: {
    available: boolean;
    openCount: number;
    sampleNames: string[];
    tier: "rich" | "ok" | "thin" | "none";
    swiggyDistanceKmAvg: number | null;
  };
  instamart: {
    available: boolean;
    productCount: number;
    sampleNames: string[];
    goToCount: number;
    tier: "rich" | "ok" | "thin" | "none";
  };
  mealHint: {
    slot: string;
    label: string;
    primaryQuery: string;
    hint: string;
    queries: string[];
    arriveAt: string;
    localHour: number;
  };
  probedAt: string;
};

export const getInterceptCoverage = (interceptId: string) =>
  api<CorridorCoverage>(`/intercepts/${interceptId}/coverage`);

export const getMealHint = (interceptId: string, server: "food" | "instamart" = "food") =>
  api<{
    interceptId: string;
    slot: string;
    label: string;
    primaryQuery: string;
    hint: string;
    queries: string[];
    arriveAt: string;
    localHour: number;
  }>(`/intercepts/${interceptId}/meal-hint?server=${server}`);

export const getHaltGate = (interceptId: string, prep?: number, riderTravel?: number) => {
  const q = new URLSearchParams();
  if (prep != null) q.set("prep", String(prep));
  if (riderTravel != null) q.set("riderTravel", String(riderTravel));
  const qs = q.toString();
  return api<{
    interceptId: string;
    transportMode: string | null;
    ok: boolean;
    severity: "ok" | "tight" | "fail";
    message: string;
    recommendation?: string;
    slackSeconds: number;
    requiredSeconds: number;
    dwellSeconds: number;
  }>(`/intercepts/${interceptId}/halt-gate${qs ? `?${qs}` : ""}`);
};

export const getReIntercept = (
  interceptId: string,
  opts?: { alignment?: string; outside?: boolean }
) => {
  const q = new URLSearchParams();
  if (opts?.alignment) q.set("alignment", opts.alignment);
  if (opts?.outside) q.set("outside", "1");
  const qs = q.toString();
  return api<{
    shouldSwitch: boolean;
    reason: string;
    currentInterceptId: string;
    recommendedInterceptId: string | null;
    recommendedName: string | null;
    alignmentLevel?: string;
    actions: string[];
  }>(`/intercepts/${interceptId}/re-intercept${qs ? `?${qs}` : ""}`);
};

export const planOrderHopPack = (lines: Array<{
  id: string;
  name: string;
  priceRupees: number;
  quantity: number;
  server: "food" | "instamart";
}>) =>
  api<{
    foodCapRupees: number;
    instamartMinRupees: number;
    foodHops: Array<{ hopIndex: number; lines: typeof lines; subtotalRupees: number; note: string }>;
    instamartHops: Array<{ hopIndex: number; lines: typeof lines; subtotalRupees: number; note: string }>;
    warnings: string[];
  }>("/orders/hop-pack", { method: "POST", body: { lines } });

export const getAdminFusion = () =>
  api<{
    deferredPending: number;
    deferredFailed: number;
    avgAlignmentScore: number | null;
    queue: Array<{
      id: string;
      server: string;
      autoPlaceAt: string | null;
      placeAttempts: number | null;
      lastPlaceError: string | null;
      mealQueryHint: string | null;
      interceptId: string | null;
      journeyId: string | null;
      userId: number | null;
    }>;
    generatedAt: string;
  }>("/admin/fusion");

export const tickAdminFusion = () =>
  api<{ due: number; placed: number }>("/admin/fusion/tick", { method: "POST" });

export const getJourneyCorridor = (journeyId: string, limit = 5) =>
  api<{
    journeyId: string;
    transportMode: string;
    stops: Array<{
      interceptId: string;
      name: string | null;
      type: string;
      score: number;
      dwellSeconds: number;
      coverage: CorridorCoverage | null;
      haltGate: {
        ok: boolean;
        severity: string;
        message: string;
        recommendation?: string;
      } | null;
      mealHint: { hint: string; primaryQuery: string; label: string };
      error?: string;
    }>;
    probedAt: string;
  }>(`/routes/${journeyId}/corridor?limit=${limit}`);

export const executeReIntercept = (
  orderId: string,
  body: { newInterceptId: string; flushCart?: boolean }
) =>
  api<{
    orderId: string;
    previousInterceptId: string | null;
    newInterceptId: string;
    flushed: boolean;
    actions: string[];
    message: string;
  }>(`/orders/${orderId}/re-intercept`, { method: "POST", body });

export const placeMultiHopOrders = (body: {
  journeyId: string;
  hops: Array<{
    interceptId: string;
    server: "food" | "instamart";
    timing?: "now" | "auto";
    restaurantId?: string;
    foodItems?: Array<{
      menuItemId: string;
      variantId?: string;
      addonIds?: string[];
      quantity: number;
    }>;
    productItems?: Array<{ productId: string; variantId: string; quantity: number }>;
    paymentMethod?: string;
    couponCode?: string;
  }>;
}) =>
  api<{ orders: unknown[]; hopCount: number }>("/orders/multi-hop", {
    method: "POST",
    body,
  });

export type CheckoutPreview = {
  addressId: string;
  address: {
    label: string;
    formatted: string;
    lat: number;
    lng: number;
    city?: string;
    postalCode?: string;
  };
  cart: Record<string, unknown>;
  total: number;
  availablePaymentMethods: string[];
  selectedPaymentMethod: string;
  coupons: Array<{
    code?: string;
    description?: string;
    requiresOnlinePayment?: boolean;
    minOrder?: number;
    maxDiscount?: number;
  }>;
  appliedCoupon: Record<string, unknown> | null;
  caps: { foodMaxRupees: number; instamartMinRupees: number };
  violations: { overCap: boolean; underMin: boolean; message: string | null };
  canPlace: boolean;
};

export const previewCheckout = (body: {
  interceptId: string;
  server: ServerType;
  restaurantId?: string;
  restaurantName?: string;
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
  couponCode?: string;
  paymentMethod?: string;
}) => api<CheckoutPreview>("/swiggy/checkout-preview", { method: "POST", body });

export const getSwiggyStatus = () =>
  api<{
    swiggyLinked: boolean;
    tokenExpired: boolean;
    expiresAt: string | null;
    needsReconnect: boolean;
    portalDemo: boolean;
    reconnectPath: string;
  }>("/swiggy/status");

export const getFoodCoupons = (interceptId: string, restaurantId: string) =>
  api<{ addressId: string; coupons: CheckoutPreview["coupons"] }>(
    `/swiggy/coupons?interceptId=${encodeURIComponent(interceptId)}&restaurantId=${encodeURIComponent(restaurantId)}`
  );

export const createInterceptAddress = (interceptId: string, landmark?: string) =>
  api<{
    addressId: string;
    label: string;
    formatted: string;
    lat: number;
    lng: number;
    city?: string;
    postalCode?: string;
  }>("/swiggy/addresses", { method: "POST", body: { interceptId, landmark } });

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
    customerContext?: {
      journeyId?: string;
      transportMode: string;
      vehicleDetails: VehicleDetails;
      riderBrief: string;
      intercept: {
        id: string;
        lat: number;
        lng: number;
        name?: string;
        address?: string;
      };
      liveLocationSharing: boolean;
      liveLocation?: GPSPosition;
      customerPosition?: { lat: number; lng: number };
      customerETA?: number;
      etaFromLiveGps?: boolean;
    } | null;
    alignmentStatus?: {
      status: string;
      color: string;
      customerETA: number;
      riderETA: number;
      orderReadyTime?: number;
      recommendation?: string;
      score?: number;
      riderOutsideIsochrone?: boolean;
    } | null;
    dualClock?: {
      customerETA: number | null;
      riderETA: number | null;
      mapsRiderETA: number | null;
      swiggyRiderETA: number | null;
      deltaSeconds: number | null;
      honesty: { swiggyDistanceKm: number | null; mapsBikeSeconds: number | null; note: string };
      clocks: {
        you: { label: string; etaSeconds: number | null };
        rider: { label: string; etaSeconds: number | null };
        kitchen: { label: string; etaSeconds: number | null };
      };
    };
    reIntercept?: {
      shouldSwitch: boolean;
      reason: string;
      recommendedInterceptId: string | null;
      recommendedName: string | null;
      actions: string[];
    } | null;
    deferred?: {
      timingType: string;
      autoPlaceAt: string | null;
      placeAttempts: number;
      lastPlaceError: string | null;
      mealQueryHint: string | null;
      haltGate: {
        ok: boolean;
        severity: string;
        message: string;
        recommendation?: string;
      } | null;
    };
  }>(`/orders/${id}/track`);

export const getOrderTrackingHistory = (id: string, limit?: number) =>
  api<z.infer<typeof TrackingEventSchema>[]>(`/orders/${id}/tracking-history${limit ? `?limit=${limit}` : ""}`);

export const deleteOrder = (id: string) => api<unknown>(`/orders/${id}`, { method: "DELETE" });
