# RouteBite — Application Design

## 1. Architecture Overview

RouteBite is a full-stack Progressive Web App built as a Bun monorepo with two main applications and shared packages. The system orchestrates delivery to moving targets by combining Google Maps route analysis with Swiggy's Multi-Capability Platform (MCP).

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PROJECT STRUCTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  apps/                                                              │
│  ├── web/              React 19 SPA (PWA)                           │
│  │   ├── src/                                                        │
│  │   │   ├── routes/        Page-level components                    │
│  │   │   ├── components/     Reusable UI components                  │
│  │   │   ├── hooks/          Custom React hooks                      │
│  │   │   ├── stores/         Zustand state management                │
│  │   │   ├── services/       API clients, maps integration           │
│  │   │   └── types/          Shared TypeScript types                 │
│  │   └── public/           Service worker, manifest, icons           │
│  │                                                                   │
│  └── api/              Hono server (Bun)                             │
│      ├── src/                                                        │
│      │   ├── routes/         API route handlers                      │
│      │   ├── services/       Business logic, external integrations   │
│      │   ├── middleware/     Auth, rate limiting, logging            │
│      │   ├── db/             Drizzle schema, migrations              │
│      │   └── types/          API types, Zod schemas                  │
│      └── tests/            Integration tests                          │
│                                                                      │
│  packages/                                                           │
│  ├── db/               Shared Drizzle schema + Turso client          │
│  └── shared/           Zod schemas, TypeScript types, utilities      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Design (apps/web)

### 2.1 Page Structure

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `JourneyInput` | Origin/destination input, transport mode selection |
| `/route/:journeyId` | `RouteAnalysis` | Map display, intercept points, server selection |
| `/browse/:interceptId/:server` | `Browse` | Restaurant or product browse with cart |
| `/cart` | `CartSummary` | Review cart, address preview, place order |
| `/track/:orderId` | `LiveTracking` | Real-time alignment dashboard |
| `/profile` | `Profile` | Orders history, Swiggy auth status |

### 2.2 Key Components

```typescript
// Map rendering with route polyline + intercept markers
interface MapProps {
  routePolyline: google.maps.LatLngLiteral[];
  intercepts: InterceptPoint[];
  activeInterceptId?: string;
  customerPosition?: GPSPosition;
  riderPosition?: GPSPosition;
}

// Intercept point card (bottom sheet content)
interface InterceptCardProps {
  point: InterceptPoint;
  foodCartCount: number;
  instamartCartCount: number;
  onSelectServer: (server: 'food' | 'instamart') => void;
}

// Alignment dashboard for live tracking
interface AlignmentDashboardProps {
  customerETA: number;     // minutes
  riderETA: number;        // minutes
  orderReadyTime: number;  // minutes
  status: 'excellent' | 'good' | 'fair' | 'poor';
}
```

### 2.3 State Management (Zustand)

```typescript
// stores/journey.ts
interface JourneyStore {
  currentJourney: Journey | null;
  route: RouteAnalysis | null;
  intercepts: InterceptPoint[];
  activeInterceptId: string | null;
  setJourney: (journey: Journey) => void;
  setRoute: (route: RouteAnalysis) => void;
  selectIntercept: (id: string) => void;
}

// stores/cart.ts
interface CartStore {
  foodCart: FoodCart | null;           // single restaurant
  instamartCart: InstamartCart;        // multi-product
  activeInterceptId: string | null;    // carts bind to intercept
  addFoodItem: (item: MenuItem, variant: string) => void;
  addInstamartItem: (item: Product, variant: string) => void;
  clearFoodCart: () => void;
  clearInstamartCart: () => void;
  getTotal: () => { food: number; instamart: number; grand: number };
}

// stores/tracking.ts
interface TrackingStore {
  activeOrders: Order[];
  customerPosition: GPSPosition | null;
  riderPositions: Record<string, GPSPosition>;
  alignmentStatus: Record<string, AlignmentStatus>;
  startTracking: (orderId: string) => void;
  stopTracking: () => void;
}
```

### 2.4 Service Layer

```typescript
// services/api.ts
class RouteBiteAPI {
  async analyzeRoute(journey: JourneyInput): Promise<RouteAnalysis>
  async getRestaurants(interceptId: string): Promise<Restaurant[]>
  async getProducts(interceptId: string): Promise<Product[]>
  async placeOrder(order: OrderInput): Promise<OrderResult>
  async trackOrder(orderId: string): Promise<TrackingUpdate>
  async cancelOrder(orderId: string): Promise<void>
}

// services/maps.ts
class MapsService {
  async geocodeAddress(address: string): Promise<LatLng>
  async reverseGeocode(lat: number, lng: number): Promise<Address>
  async renderRoute(map: google.maps.Map, route: Route): void
  async updateUserMarker(position: GPSPosition): void
}
```

### 2.5 PWA Configuration

- **Service Worker**: Vite PWA plugin, caches static assets + route data
- **Manifest**: `short_name: "RouteBite"`, `theme_color: "#0A0A0F"`, `display: standalone`
- **Icons**: Generated from a single SVG source
- **Offline**: Cached route views read-only; order placement requires network

---

## 3. Backend Design (apps/api)

### 3.1 Route Handlers

```typescript
// routes/routes.ts
POST /api/v1/routes/analyze
  body: { origin: string, destination: string, transportMode: TransportMode }
  → { journeyId, routePolyline, intercepts[], estimatedDuration }

// routes/intercepts.ts
GET /api/v1/intercepts/:id/restaurants
  → { restaurants[], pagination }

GET /api/v1/intercepts/:id/products
  → { products[], categories[], pagination }

// routes/orders.ts
POST /api/v1/orders
  body: { interceptId, foodCart?, instamartCart?, timing: 'now' | 'auto' }
  → { orderId, status, estimatedInterceptTime, swiggyOrderId? }

GET /api/v1/orders/:id/track
  → { customerETA, riderETA, orderStatus, alignmentStatus }

DELETE /api/v1/orders/:id
  → { status: 'cancelled' | 'not_cancellable' }

// routes/auth.ts
GET /api/v1/auth/swiggy
  → redirect to Swiggy OAuth authorize endpoint

GET /api/v1/auth/callback
  query: { code, state }
  → { success, tokenSet }
```

### 3.2 Service Layer

```typescript
// services/intercept/algorithm.ts
class InterceptAlgorithm {
  /**
   * ML Rendezvous Algorithm
   * Compute optimal intercept points and rider origin for a journey
   */
  async computeInterceptPoints(
    route: google.maps.Route,
    transportMode: TransportMode
  ): Promise<InterceptPoint[]> {
    // 1. Extract candidate points from route (traffic lights, stops, pumps, tolls)
    // 2. For each candidate: dwell time = signalCycle + approachDelay + buffer
    // 3. Score each point: restaurantDensity * safety * dwellTime * feasibility
    // 4. Filter: score >= 60, dwell >= 3min
    // 5. Sort by: minimize abs(customerETA - riderETA)
    // 6. Return top 5 candidates
  }

  /**
   * Auto-place timing calculation
   */
  calculateOptimalPlacementTime(
    interceptETA: number,
    prepTime: number,
    riderTravel: number
  ): number {
    const safetyBuffer = 10 * 60;  // 10 min
    const trafficBuffer = 5 * 60;  // 5 min
    return interceptETA - prepTime - riderTravel - safetyBuffer - trafficBuffer;
  }
}

// services/order/placement.ts
class OrderService {
  /**
   * Place order with non-idempotent guard
   */
  async placeOrder(
    ctx: Context,
    input: OrderInput
  ): Promise<OrderResult> {
    // 1. Generate address: reverse geocode intercept lat/lng
    // 2. Build order notes with vehicle details
    // 3. Check for existing orders via get_food_orders (prevent double-submit)
    // 4. Place order with confirmed: true
    // 5. Store mapping: swiggyOrderId <-> routebiteOrderId
    // 6. Return result
  }
}

// services/tracking/alignment.ts
class TrackingService {
  /**
   * Poll both GPS sources and compute alignment
   */
  async getAlignmentStatus(orderId: string): Promise<AlignmentStatus> {
    // 1. Get customer GPS position (most recent poll)
    // 2. Get rider position from Swiggy track API
    // 3. Calculate customerETA (from current GPS to intercept along route)
    // 4. Calculate riderETA (free-moving from rider GPS to intercept)
    // 5. Compare with orderReadyTime
    // 6. Return status + recommendation
  }
}
```

### 3.3 External Integrations

```typescript
// services/swiggy/client.ts
class SwiggyMCPClient {
  private baseURL: string;
  private isMock: boolean;

  // OAuth
  async getAuthorizationURL(pkce: PKCEPair): Promise<string>
  async exchangeCode(code: string, verifier: string): Promise<TokenSet>

  // Food Server
  async searchFood(query: string, lat: number, lng: number): Promise<Restaurant[]>
  async getMenu(restaurantId: string): Promise<Menu>
  async placeFoodOrder(cart: FoodCart, address: Address, notes: string, confirmed: boolean): Promise<Order>
  async getFoodOrders(): Promise<Order[]>
  async trackFoodOrder(orderId: string): Promise<Tracking>

  // Instamart Server
  async searchInstamart(query: string, lat: number, lng: number): Promise<Product[]>
  async getInstamartCart(): Promise<Cart>
  async addToCart(item: Product): Promise<void>
  async checkout(cart: Cart, address: Address, notes: string, confirmed: boolean): Promise<Order>
  async getOrders(): Promise<Order[]>
  async trackOrder(orderId: string): Promise<Tracking>
}

// services/maps/google.ts
class GoogleMapsClient {
  // Server-side (protected API key)
  async computeRoute(request: RouteRequest): Promise<Route>
  async geocode(address: string): Promise<LatLng>
  async reverseGeocode(lat: number, lng: number): Promise<Address>

  // Client-side (through Maps JS API)
  renderRouteOnMap(map: google.maps.Map, route: Route): void
  addInterceptMarkers(map: google.maps.Map, intercepts: InterceptPoint[]): void
}
```

### 3.4 Database Schema (Drizzle ORM)

```typescript
// packages/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  swiggyIdHash: text('swiggy_id_hash').notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshToken: text('refresh_token'), // v1.0: not used but schema ready
  tokenExpiry: integer('token_expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const journeys = sqliteTable('journeys', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  originLat: real('origin_lat').notNull(),
  originLng: real('origin_lng').notNull(),
  destLat: real('dest_lat').notNull(),
  destLng: real('dest_lng').notNull(),
  transportMode: text('transport_mode', { enum: ['bus', 'train', 'car', 'bike', 'metro', 'walk'] }).notNull(),
  vehicleDetails: text('vehicle_details', { mode: 'json' }), // { plate, color, description }
  routePolyline: text('route_polyline').notNull(),
  status: text('status', { enum: ['active', 'completed', 'cancelled'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const intercepts = sqliteTable('intercepts', {
  id: text('id').primaryKey(),
  journeyId: text('journey_id').references(() => journeys.id),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  type: text('type', { enum: ['traffic_light', 'stop', 'petrol_pump', 'toll_plaza', 'dynamic'] }).notNull(),
  score: integer('score').notNull(),
  estimatedDwellTime: integer('estimated_dwell_time'), // seconds
  restaurantCount: integer('restaurant_count'),
  safetyRating: real('safety_rating'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  journeyId: text('journey_id').references(() => journeys.id),
  interceptId: text('intercept_id').references(() => intercepts.id),
  swiggyOrderId: text('swiggy_order_id'),
  server: text('server', { enum: ['food', 'instamart'] }).notNull(),
  status: text('status', { enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'failed'] }).notNull(),
  totalAmount: integer('total_amount').notNull(), // paise
  timingType: text('timing_type', { enum: ['now', 'auto'] }).notNull(),
  placedAt: integer('placed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const trackingEvents = sqliteTable('tracking_events', {
  id: integer('id').primaryKey(),
  orderId: text('order_id').references(() => orders.id),
  customerLat: real('customer_lat'),
  customerLng: real('customer_lng'),
  riderLat: real('rider_lat'),
  riderLng: real('rider_lng'),
  customerETA: integer('customer_eta'), // seconds
  riderETA: integer('rider_eta'),       // seconds
  alignmentScore: real('alignment_score'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

---

## 4. Security Design

### Authentication Flow

```
User → GET /api/v1/auth/swiggy
       Server generates: code_verifier (S256), state (CSRF)
       Redirect to: Swiggy authorize?client_id=...&code_challenge=...&state=...
       
User approves → Swiggy redirects to /api/v1/auth/callback?code=...&state=...
       Server verifies state, exchanges code + verifier for tokens
       Access token encrypted (AES-256-GCM) → stored in DB
       
Subsequent requests: Bearer <encrypted_token> (decrypted server-side)
```

### Data Protection

| Data | Rest | Transit | Lifecycle |
|------|------|---------|-----------|
| Swiggy user ID | SHA256 hash | HTTPS | Session |
| Access token | AES-256-GCM encrypted | HTTPS | Expire + delete |
| GPS coordinates | Plain (anonymized) | HTTPS | Purge <24h |
| Order data | Referenced (swiggyOrderId only) | HTTPS | Session |
| Cart contents | In-memory + localStorage | HTTPS | Session |

---

## 5. Key Algorithms

### 5.1 Rendezvous Scoring

```typescript
function scoreInterceptPoint(point: CandidatePoint): number {
  const dwellScore = Math.min(point.dwellTime / 180, 1) * 30;           // 30pts max, 3min ideal
  const restaurantScore = Math.min(point.restaurantCount / 10, 1) * 25; // 25pts max
  const safetyScore = point.safetyRating / 5 * 25;                       // 25pts max, 5-star ideal
  const typeScore = {
    'stop': 15, 'traffic_light': 12, 'petrol_pump': 10,
    'toll_plaza': 8, 'dynamic': 5
  }[point.type] || 0;
  
  return Math.round(dwellScore + restaurantScore + safetyScore + typeScore);
}
```

### 5.2 ETA Alignment Status

```typescript
function getAlignmentStatus(
  customerETA: number,
  riderETA: number,
  orderReadyTime: number
): AlignmentStatus {
  const diff = Math.abs(customerETA - Math.max(riderETA, orderReadyTime));
  
  if (diff <= 2 * 60)       return { status: 'excellent', color: '#4CAF50' };
  else if (diff <= 5 * 60)  return { status: 'good', color: '#8BC34A' };
  else if (diff <= 10 * 60) return { status: 'fair', color: '#FFC107' };
  else                       return { status: 'poor', color: '#FF5722', recommendation: 'Recalculate intercept' };
}
```

### 5.3 Transport Mode → Google Routing

```typescript
function mapToGoogleMode(mode: TransportMode): { travelMode: string, routingPreference?: string } {
  switch (mode) {
    case 'car':      return { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL' };
    case 'bike':     return { travelMode: 'TWO_WHEELER', routingPreference: 'TRAFFIC_AWARE_OPTIMAL' };
    case 'bus':      return { travelMode: 'TRANSIT' }; // Schedule-based, no traffic awareness
    case 'train':    return { travelMode: 'TRANSIT' };
    case 'metro':    return { travelMode: 'TRANSIT' };
    case 'walk':     return { travelMode: 'WALK' };
    default:         return { travelMode: 'DRIVE' };
  }
}
```

---

## 6. Error Handling Architecture

```
API Error → normalize error code → determine retry strategy → execute → log

Retry Strategies:
- Auth errors (401/419)       → Redirect to OAuth (no retry)
- Rate limits (429)           → Honor Retry-After, max 30s budget
- Server errors (5xx/TIMEOUT) → Exponential backoff (1s, 2s, 4s, 8s), max 4 attempts
- Network errors              → Same as 5xx, with online/offline detection

Client Error Handling:
- UI debounce on order buttons (500ms minimum)
- Optimistic updates with rollback on failure
- Toast notifications for all error states
- Inline validation for cart constraints (₹1000 food cap, ₹99 instamart min)
```

---

## 7. Testing Strategy

| Level | Tools | Coverage |
|-------|-------|----------|
| Unit (frontend) | Vitest + jsdom | Components, hooks, utilities |
| Unit (backend) | Bun test | Services, pure functions |
| Integration | Bun test + fetch | API routes, DB operations |
| E2E (mock) | Playwright | Full flows against mock MCP |
| Property-Based | fast-check | Round-trip serialization, coordinate transforms |
| Visual | Storybook | Component states, responsive |

---

## 8. Deployment Architecture

| Environment | Platform | Config |
|-------------|----------|--------|
| Development | Local Bun | `localhost:3000` (web), `localhost:8787` (api) |
| Mock Mode | Local Bun | Mock server `localhost:8788`, SQLite local |
| Production (future) | Vercel/Netlify (web), Railway/Fly (api) | Turso DB, KV for sessions |

---

*Application Design | 2026-05-08*
