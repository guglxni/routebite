import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// RouteBite Database Schema (SQLite / libSQL / Turso)
// ─────────────────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  swiggyIdHash: text('swiggy_id_hash').notNull().unique(),
  /** Portal login username (hardcoded demo accounts). */
  username: text('username').unique(),
  email: text('email'),
  name: text('name'),
  /** Portal role — isolates user / rider / admin dashboards. */
  role: text('role', { enum: ['user', 'rider', 'admin'] }).notNull().default('user'),
  /** Rider ops: offline | online | busy (ignored for non-riders). */
  riderPresence: text('rider_presence', { enum: ['offline', 'online', 'busy'] }).default('offline'),
  /** Last known rider GPS (fleet + ETA). */
  lastLat: real('last_lat'),
  lastLng: real('last_lng'),
  lastLocationAt: integer('last_location_at', { mode: 'timestamp' }),
  sessionToken: text('session_token').unique(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiry: integer('token_expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const journeys = sqliteTable('journeys', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  originAddress: text('origin_address').notNull(),
  originLat: real('origin_lat').notNull(),
  originLng: real('origin_lng').notNull(),
  destAddress: text('dest_address').notNull(),
  destLat: real('dest_lat').notNull(),
  destLng: real('dest_lng').notNull(),
  transportMode: text('transport_mode', { enum: ['bus', 'train', 'car', 'bike', 'metro', 'walk'] }).notNull(),
  vehicleDetailsJson: text('vehicle_details_json'), // { plateNumber?, color?, description }
  routePolyline: text('route_polyline').notNull(),
  estimatedDuration: integer('estimated_duration'), // seconds
  status: text('status', { enum: ['active', 'completed', 'cancelled'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const intercepts = sqliteTable('intercepts', {
  id: text('id').primaryKey(),
  journeyId: text('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  type: text('type', { enum: ['traffic_light', 'stop', 'petrol_pump', 'toll_plaza', 'dynamic'] }).notNull(),
  score: integer('score').notNull(),
  estimatedDwellTime: integer('estimated_dwell_time'), // seconds
  restaurantCount: integer('restaurant_count'),
  /** Restaurants inside rider inbound isochrone (true reachability). */
  reachableRestaurantCount: integer('reachable_restaurant_count'),
  safetyRating: real('safety_rating'),
  name: text('name'),
  /** Serialized InterceptReachability (polygons + budgets). */
  reachabilityJson: text('reachability_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  /** Assigned delivery partner (rider portal user). */
  riderId: integer('rider_id').references(() => users.id, { onDelete: 'set null' }),
  journeyId: text('journey_id').references(() => journeys.id, { onDelete: 'set null' }),
  interceptId: text('intercept_id').references(() => intercepts.id, { onDelete: 'set null' }),
  swiggyOrderId: text('swiggy_order_id'),
  server: text('server', { enum: ['food', 'instamart'] }).notNull(),
  status: text('status', { enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'failed'] }).notNull().default('pending'),
  totalAmount: integer('total_amount').notNull(), // paise
  timingType: text('timing_type', { enum: ['now', 'auto'] }).notNull(),
  placedAt: integer('placed_at', { mode: 'timestamp' }),
  /** When timing=auto: wall-clock time to call Swiggy place (Maps traffic recompute before). */
  autoPlaceAt: integer('auto_place_at', { mode: 'timestamp' }),
  /** Serialized cart + restaurant payload for deferred placer. */
  deferredPayloadJson: text('deferred_payload_json'),
  placeAttempts: integer('place_attempts').default(0),
  lastPlaceError: text('last_place_error'),
  swiggyAddressId: text('swiggy_address_id'),
  /** Meal-time query hint derived from intercept ETA clock. */
  mealQueryHint: text('meal_query_hint'),
  /** Train halt gate evaluation JSON (ok / reason / windows). */
  haltGateJson: text('halt_gate_json'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const trackingEvents = sqliteTable('tracking_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  customerLat: real('customer_lat'),
  customerLng: real('customer_lng'),
  riderLat: real('rider_lat'),
  riderLng: real('rider_lng'),
  customerETA: integer('customer_eta'), // seconds
  riderETA: integer('rider_eta'),       // seconds
  alignmentScore: real('alignment_score'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ─── Indexes ─────────────────────────────────────────────────────────────────

export const journeyUserIdx = uniqueIndex('journey_user_active_idx').on(
  journeys.userId,
  journeys.status
);

export const interceptJourneyIdx = uniqueIndex('intercept_journey_idx').on(
  intercepts.journeyId,
  intercepts.lat,
  intercepts.lng
);

export const orderSwiggyIdx = uniqueIndex('order_swiggy_idx').on(
  orders.swiggyOrderId
);

export const trackingEventOrderIdx = uniqueIndex('tracking_event_order_idx').on(
  trackingEvents.orderId,
  trackingEvents.recordedAt
);
