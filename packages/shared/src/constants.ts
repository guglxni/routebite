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
  MIN_SCORE: 60,
  MIN_DWELL_TIME_S: 3 * 60, // 3 minutes
  SCORE_WEIGHTS: {
    DWELL_TIME: 30,
    RESTAURANT_DENSITY: 25,
    SAFETY: 25,
    TYPE: 20,
  },
};

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
  MAX_ATTEMPTS: 4,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 15000,
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
} as const;

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
