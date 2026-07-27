// ─────────────────────────────────────────────────────────────────────────────
// RouteBite Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const CART_LIMITS = {
  FOOD_MAX_RUPEES: 1000 * 100, // ₹1000 in paise
  INSTAMART_MIN_RUPEES: 99 * 100, // ₹99 in paise
};

export const JOURNEY_CONSTRAINTS = {
  MIN_DISTANCE_M: 5000, // 5 km
  MAX_DISTANCE_M: 500000, // 500 km
};

export const INTERCEPT_SCORING = {
  MAX_SCORE: 100,
  /** Soft floor — filterAndRankPoints also falls back to top-N if none pass. */
  MIN_SCORE: 50,
  MIN_DWELL_TIME_S: 3 * 60, // 3 minutes
  SCORE_WEIGHTS: {
    DWELL_TIME: 25,
    /** Circular Places density (legacy signal). */
    RESTAURANT_DENSITY: 15,
    /** Restaurants inside rider inbound isochrone (true reachability). */
    REACHABILITY: 25,
    SAFETY: 20,
    TYPE: 15,
  },
};

/** Thresholds for heap top-k and geohash spatial indexing (see @routebite/shared/algorithms). */
export const INTERCEPT_ALGORITHMS = {
  /** Switch to geohash grid spacing above this candidate count. */
  GEOHASH_SPATIAL_THRESHOLD: 100,
  /** Use O(n log k) heap pre-filter above this pool size. */
  TOP_K_HEAP_THRESHOLD: 50,
  /** Pre-filter pool size multiplier before greedy spacing. */
  TOP_K_POOL_MULTIPLIER: 10,
} as const;

export const INTERCEPT_TYPE_BONUS: Record<string, number> = {
  stop: 15,
  traffic_light: 12,
  petrol_pump: 10,
  toll_plaza: 8,
  dynamic: 5,
};

export const TIMING = {
  SAFETY_BUFFER_S: 10 * 60, // 10 minutes
  TRAFFIC_BUFFER_S: 5 * 60, // 5 minutes
  AUTO_PLACE_FORMULA: (interceptETA_S: number, prepTime_S: number, riderTravel_S: number) =>
    interceptETA_S - prepTime_S - riderTravel_S - TIMING.SAFETY_BUFFER_S - TIMING.TRAFFIC_BUFFER_S,
};

export const TRACKING = {
  GPS_POLL_INTERVAL_MS: 15000, // 15 seconds
  RIDER_POLL_INTERVAL_MS: 15000, // 15 seconds
  ALIGNMENT_THRESHOLDS: {
    EXCELLENT_S: 2 * 60, // 2 minutes
    GOOD_S: 5 * 60, // 5 minutes
    FAIR_S: 10 * 60, // 10 minutes
  },
  NOTIFICATION_THRESHOLDS: {
    RIDER_APPROACHING_MIN: 10,
    CUSTOMER_APPROACHING_MIN: 5,
  },
};

export const RETRY_STRATEGY = {
  /** Builders Club: start 500ms, double, jitter, cap ~5 attempts */
  MAX_ATTEMPTS: 5,
  BASE_DELAY_MS: 500,
  MAX_DELAY_MS: 8000,
  RATE_LIMIT_BUDGET_S: 30,
};

export const RATE_LIMITS = {
  API_PER_IP_PER_MIN: 100,
  SWIGGY_PROXY_PER_USER_PER_MIN: 10,
};

export const DATA_RETENTION = {
  GPS_PURGE_AFTER_H: 24,
  SESSION_EXPIRY_BUFFER_S: 300, // 5 minutes before token expiry
};

export const MAPS_CONFIG = {
  PLACES_AGGREGATE_RADIUS_M: 500,
  RESTAURANT_COUNT_CACHE_TTL_MS: 60 * 60_000,
  WEATHER_CACHE_TTL_MS: 60 * 60_000,
  WEATHER_ALERT_CACHE_TTL_MS: 15 * 60_000,
  WEATHER_LANGUAGE: 'en-IN',
  /** Precipitation probability above this triggers safety penalty */
  WEATHER_PRECIP_WARNING_PCT: 70,
  /** Safety rating deduction when weather is adverse */
  WEATHER_SAFETY_PENALTY: 0.5,
  /** Extra timing buffer (seconds) when rain likely at intercept */
  WEATHER_TIMING_BUFFER_S: 5 * 60,
  /** Air Quality / Pollen caches */
  AIR_QUALITY_CACHE_TTL_MS: 30 * 60_000,
  POLLEN_CACHE_TTL_MS: 60 * 60_000,
  /**
   * Google Universal AQI: higher = better (100–80 Excellent … 19–0 Poor).
   * Warn / penalize when UAQI is **below** this floor (Low / Poor bands).
   * @see https://developers.google.com/maps/documentation/air-quality/laqis
   */
  AIR_QUALITY_UAQI_MIN_OK: 40,
  /** @deprecated Use AIR_QUALITY_UAQI_MIN_OK — old name implied inverted scale */
  AIR_QUALITY_UAQI_WARNING: 40,
  AIR_QUALITY_SAFETY_PENALTY: 0.4,
  /** India CPCB NAQI: higher = worse. Warn at Satisfactory+ unhealthy bands. */
  AIR_QUALITY_LOCAL_AQI_WARNING: 101,
  /** Any pollen index at or above this adds a mild outdoor penalty */
  POLLEN_INDEX_WARNING: 3,
  POLLEN_SAFETY_PENALTY: 0.25,
  /** Isochrones API cache TTL */
  ISOCHRONE_CACHE_TTL_MS: 30 * 60_000,
  /** Geohash precision for isochrone cache keys (~1.2 km cells at 3 dp) */
  ISOCHRONE_CACHE_GRID_PRECISION: 3,
  /** Max concurrent isochrone generations per analyze call */
  ISOCHRONE_MAX_PER_ANALYZE: 5,
  /** Vertex stride when persisting polygons for the wire/DB */
  ISOCHRONE_SIMPLIFY_STRIDE: 3,
} as const;

/**
 * Isochrones budgets — true road-network reachability for riders & walkers.
 * @see https://developers.google.com/maps/documentation/isochrones/overview
 */
export const ISOCHRONE = {
  /** India delivery bikes ≈ BICYCLE + buffer (no TWO_WHEELER mode on Isochrones). */
  RIDER_MODE: 'BICYCLE' as const,
  WALK_MODE: 'WALK' as const,
  DRIVE_MODE: 'DRIVE' as const,
  /** Extra % on bike budgets to compensate for BICYCLE vs real two-wheeler. */
  BIKE_BUFFER_RATIO: 1.12,
  /** Floor / cap for rider inbound budget (seconds). */
  RIDER_MIN_BUDGET_S: 8 * 60,
  RIDER_MAX_BUDGET_S: 25 * 60,
  /** Customer handoff / platform walk zone. */
  WALK_BUDGET_S: 4 * 60,
  /** Seconds reserved for prep before rider travel from dwell. */
  PREP_RESERVE_S: 12 * 60,
  /** Soft-block place when restaurant is outside rider isochrone. */
  ENFORCE_RESTAURANT_INSIDE: true,
} as const;

/** Feature flags for Google Maps Platform enhancements (Phase 1+) */
export const MAPS_FEATURES = {
  PLACES_AGGREGATE: true,
  PLACES_NEARBY_FALLBACK: true,
  ROUTES_EXTRA_COMPUTATIONS: true,
  DEPARTURE_TIME_ROUTING: true,
  WEATHER_SAFETY: true,
  WEATHER_ALERTS: true,
  TRAFFIC_DWELL_ADJUSTMENT: true,
  /** Google Isochrones API — true reachability polygons */
  ISOCHRONES: true,
  /** Nearby Search + PIP for restaurants inside rider isochrone */
  ISOCHRONE_RESTAURANT_PIP: true,
  /** Attach walk + rider polygons to intercept API responses */
  ISOCHRONE_UI_POLYGONS: true,
  /** Spatial check: is rider still inside shrinking dwell isochrone */
  ISOCHRONE_TRACKING: true,
  /** Recompute customer→intercept ETA from live GPS on Track (Route Matrix + departureTime) */
  TRACK_DEPARTURE_TIME_RECOMPUTE: true,
  /** Food delivery Matrix/Routes use TWO_WHEELER (TransportMode bike) */
  RIDER_TWO_WHEELER: true,
  /** Air Quality API for outdoor handoff safety */
  AIR_QUALITY_SAFETY: true,
  /** Pollen API for outdoor handoff / bike rider safety */
  POLLEN_SAFETY: true,
  /** Routes optimizeWaypointOrder + optional Route Optimization API */
  ROUTE_OPTIMIZATION: true,
  /** Prefer Google Route Optimization API when GCP project set; else waypoint order */
  ROUTE_OPTIMIZATION_CLOUD_API: false,
  /** Web Places UI Kit (client key). Server flag documents intent; web checks VITE_ key. */
  PLACES_UI_KIT: true,
} as const;

/**
 * Swiggy-like delivery riders in India → Routes/Matrix `TWO_WHEELER`
 * via TransportMode `bike`. Instamart heavy bags may use car.
 */
export function riderTransportMode(server: 'food' | 'instamart' = 'food'): 'bike' | 'car' {
  if (!MAPS_FEATURES.RIDER_TWO_WHEELER) return 'bike';
  return server === 'instamart' ? 'car' : 'bike';
}

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  // Cart
  CART_FOOD_CAP_EXCEEDED: 'CART_FOOD_CAP_EXCEEDED',
  CART_INSTAMART_MIN_NOT_MET: 'CART_INSTAMART_MIN_NOT_MET',
  CART_RESTAURANT_MISMATCH: 'CART_RESTAURANT_MISMATCH',
  // Order
  ORDER_DOUBLE_SUBMIT: 'ORDER_DOUBLE_SUBMIT',
  ORDER_NON_IDEMPOTENT: 'ORDER_NON_IDEMPOTENT',
  // Coverage
  NO_SWIGGY_COVERAGE: 'NO_SWIGGY_COVERAGE',
  RESTAURANT_CLOSED: 'RESTAURANT_CLOSED',
  // Route
  ROUTE_TOO_SHORT: 'ROUTE_TOO_SHORT',
  ROUTE_TOO_LONG: 'ROUTE_TOO_LONG',
  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
} as const;
