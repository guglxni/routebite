# RouteBite — Construction Units

## Implementation Order

### Unit 00: Shared Package Foundation
**Scope:** Initialize `packages/shared` with Zod schemas and TypeScript types used across frontend and backend.

**Files:**
- `packages/shared/package.json`
- `packages/shared/src/types.ts` — Journey, InterceptPoint, TransportMode, Order, Cart
- `packages/shared/src/schemas.ts` — Zod validation schemas for all API inputs/outputs
- `packages/shared/src/constants.ts` — Transport mode enums, cart limits, scoring weights

**Dependencies:** zod, typescript
**Verification:** All imports resolve; schemas validate sample data correctly.

---

### Unit 01: Database Package & Schema
**Scope:** Initialize `packages/db` with Drizzle ORM schema, migrations, and Turso client.

**Files:**
- `packages/db/package.json`
- `packages/db/src/schema.ts` — All tables (users, journeys, intercepts, orders, tracking_events)
- `packages/db/src/client.ts` — libSQL/Turso connection wrapper
- `packages/db/drizzle.config.ts` — Migration configuration
- `packages/db/migrations/` — Initial migration

**Dependencies:** drizzle-orm, @libsql/client, better-sqlite3 (dev)
**Verification:** Schema generates valid SQLite SQL; migration runs without errors; CRUD test passes.

---

### Unit 02: Backend Foundation & Middleware
**Scope:** Set up Hono server with routing structure, middleware stack, and health endpoints.

**Files:**
- `apps/api/src/index.ts` — Hono app entry, CORS, logger
- `apps/api/src/middleware/auth.ts` — Bearer token extraction, decryption
- `apps/api/src/middleware/rate-limit.ts` — 100 req/min per IP
- `apps/api/src/middleware/error-handler.ts` — Standardized error response format
- `apps/api/src/middleware/request-id.ts` — X-Request-ID tracing
- `apps/api/src/routes/health.ts` — `GET /health`, `GET /health/db`

**Dependencies:** hono, @hono/node-server, zod
**Verification:** `bun run dev` starts server; health endpoints return 200; middleware chains correctly.

---

### Unit 03: Google Maps Service Client
**Scope:** Server-side Google Maps API client with caching.

**Files:**
- `apps/api/src/services/maps/client.ts` — Routes v2, Geocoding, reverse geocode
- `apps/api/src/services/maps/types.ts` — Request/response type adapters
- `apps/api/src/services/maps/cache.ts` — Simple in-memory LRU cache for route results
- `apps/api/src/services/maps/constants.ts` — Transport mode mapping to Google modes

**Dependencies:** none (native fetch)
**Verification:** Mock Google API responses; cache hit/miss works; route polyline decodes correctly.

---

### Unit 04: Route Analysis Service
**Scope:** Analyze user journey, compute route, extract candidate intercept points.

**Files:**
- `apps/api/src/services/intercept/algorithm.ts` — Main algorithm: route → candidate points
- `apps/api/src/services/intercept/scoring.ts` — Score candidates by dwell time, safety, restaurant density
- `apps/api/src/services/intercept/types.ts` — Point types, scoring weights
- `apps/api/src/services/intercept/utils.ts` — Polyline decoding, distance calculation

**Dependencies:** Google Maps client (Unit 03), shared types (Unit 00)
**Verification:** Sample Mumbai-Pune route returns ≥3 intercept points; all scores ≥60; types are valid.

---

### Unit 05: Mock Swiggy MCP Server
**Scope:** Complete mock server at `localhost:8788` replicating all Swiggy MCP endpoints.

**Files:**
- `apps/mock-server/src/index.ts` — Hono server with all endpoints
- `apps/mock-server/src/oauth/authorize.ts` — `/auth/authorize`
- `apps/mock-server/src/oauth/token.ts` — `/auth/token` (PKCE validation)
- `apps/mock-server/src/food/search.ts` — `/food` search, menu, order, track
- `apps/mock-server/src/instamart/search.ts` — `/instamart` search, cart, checkout, track
- `apps/mock-server/src/data/fixtures.ts` — Sample restaurants, menus, products

**Dependencies:** hono, @hono/node-server
**Verification:** OAuth flow completes; mock restaurant search returns data; mock order returns order ID.

---

### Unit 06: Swiggy MCP Proxy Client
**Scope:** Backend client that speaks to Swiggy MCP (or mock) with OAuth management.

**Files:**
- `apps/api/src/services/swiggy/client.ts` — All MCP endpoints: auth, search, order, track
- `apps/api/src/services/swiggy/types.ts` — MCP request/response adapters
- `apps/api/src/services/swiggy/oauth.ts` — PKCE pair generation, token exchange, refresh (v1.1)
- `apps/api/src/services/swiggy/error-handler.ts` — Map Swiggy errors to retry strategies

**Dependencies:** shared types, DB (for token storage)
**Verification:** Mock mode: full OAuth + order flow works. Error injection: 401 triggers redirect, 5xx triggers backoff.

---

### Unit 07: Order Placement Service with Guards
**Scope:** Order placement with address generation, timing calculation, and non-idempotent guard.

**Files:**
- `apps/api/src/services/order/placement.ts` — Core placement logic
- `apps/api/src/services/order/timing.ts` — Auto-place time calculation
- `apps/api/src/services/order/address.ts` — Reverse geocode + label generation
- `apps/api/src/services/order/guard.ts` — Double-submit protection via get_food_orders pre-check
- `apps/api/src/services/order/types.ts` — Order input/output types

**Dependencies:** Google Maps client, Swiggy client, DB
**Verification:** Mock order placed with correct address; rapid double-click prevented; retry after failure works.

---

### Unit 08: Backend API Routes
**Scope:** All REST API endpoints wired to services.

**Files:**
- `apps/api/src/routes/routes.ts` — `POST /api/v1/routes/analyze`
- `apps/api/src/routes/intercepts.ts` — `GET /api/v1/intercepts/:id/{restaurants,products}`
- `apps/api/src/routes/orders.ts` — `POST /api/v1/orders`, `GET /api/v1/orders/:id/track`, `DELETE /api/v1/orders/:id`
- `apps/api/src/routes/auth.ts` — `GET /api/v1/auth/swiggy`, `GET /api/v1/auth/callback`
- `apps/api/src/routes/user.ts` — `GET /api/v1/user/orders`

**Dependencies:** All services (Units 03–07)
**Verification:** API test suite passes for all endpoints with mock backend.

---

### Unit 09: Frontend Foundation & Router
**Scope:** React 19 SPA with routing, dark theme, and PWA setup.

**Files:**
- `apps/web/src/main.tsx` — React 19 createRoot with StrictMode
- `apps/web/src/App.tsx` — Router setup with all routes
- `apps/web/src/index.css` — Dark theme CSS variables (`#0A0A0F`, `#FF5722`)
- `apps/web/src/routes/Layout.tsx` — Root layout with bottom nav
- `apps/web/vite.config.ts` — PWA plugin configuration
- `apps/web/public/manifest.json` — PWA manifest
- `apps/web/public/sw.ts` — Service worker (Workbox)

**Dependencies:** react, react-dom, react-router-dom, vite-plugin-pwa, tailwindcss
**Verification:** `bun run dev` serves app; all routes render; PWA manifest valid; dark theme applied.

---

### Unit 10: State Management (Zustand)
**Scope:** Global state stores for journey, cart, and tracking.

**Files:**
- `apps/web/src/stores/journey.ts` — Journey store
- `apps/web/src/stores/cart.ts` — Cart store (Food + Instamart isolation)
- `apps/web/src/stores/tracking.ts` — Tracking store
- `apps/web/src/stores/user.ts` — User/auth store

**Dependencies:** zustand, shared types
**Verification:** Stores update and persist; cart constraints enforced in state; store composition works.

---

### Unit 11: API Service Layer (Frontend)
**Scope:** Typed API client consuming backend endpoints.

**Files:**
- `apps/web/src/services/api.ts` — Fetch wrapper with auth header, error normalization
- `apps/web/src/services/maps.ts` — Google Maps JS API integration
- `apps/web/src/services/geolocation.ts` — GPS polling abstraction
- `apps/web/src/services/types.ts` — Frontend service types

**Dependencies:** shared types
**Verification:** API calls return typed data; error normalization maps to UI states; GPS polling starts/stops correctly.

---

### Unit 12: Journey Input Page
**Scope:** Origin/destination autocomplete, transport mode, vehicle details.

**Files:**
- `apps/web/src/routes/JourneyInput.tsx` — Main page
- `apps/web/src/components/LocationSearch.tsx` — Google Places autocomplete
- `apps/web/src/components/TransportModeSelector.tsx` — Mode buttons with icons
- `apps/web/src/components/VehicleDetailsForm.tsx` — Plate, color, description inputs

**Dependencies:** Maps service, journey store
**Verification:** Address autocomplete works; route validation (5–500km) enforced; form state persists.

---

### Unit 13: Route Analysis Page
**Scope:** Map display with route polyline and intercept markers.

**Files:**
- `apps/web/src/routes/RouteAnalysis.tsx` — Main page with map
- `apps/web/src/components/MapView.tsx` — Google Maps rendering
- `apps/web/src/components/InterceptMarkers.tsx` — Marker cluster with click handling
- `apps/web/src/components/InterceptBottomSheet.tsx` — Bottom sheet on marker tap
- `apps/web/src/components/InterceptScoreBadge.tsx` — Score visualization

**Dependencies:** Maps service, journey store, API service
**Verification:** Route renders on map; markers clickable; bottom sheet shows correct data; scores visible.

---

### Unit 14: Food Browse Components
**Scope:** Restaurant list, menu display, add-to-cart with constraints.

**Files:**
- `apps/web/src/components/FoodRestaurantList.tsx` — Restaurant cards sorted by ETA match
- `apps/web/src/components/FoodMenu.tsx` — Menu groups (Recommended, Veg Only, Bestsellers)
- `apps/web/src/components/FoodMenuItem.tsx` — Item card with variants/add-ons
- `apps/web/src/components/FoodCartBar.tsx` — Bottom bar with ₹1000 cap indicator

**Dependencies:** cart store, API service
**Verification:** Restaurant list loads; menu renders; ₹1000 cap enforced; single-restaurant constraint works.

---

### Unit 15: Instamart Browse Components
**Scope:** Product categories, search, add-to-cart.

**Files:**
- `apps/web/src/components/InstamartCategoryList.tsx` — Category grid
- `apps/web/src/components/InstamartProductList.tsx` — Product cards with variants
- `apps/web/src/components/InstamartSearch.tsx` — Search + filters
- `apps/web/src/components/InstamartCartBar.tsx` — Bottom bar with ₹99 minimum indicator

**Dependencies:** cart store, API service
**Verification:** Products load; search filters work; ₹99 minimum enforced; multi-product cart works.

---

### Unit 16: Cart & Checkout Flow
**Scope:** Cart review, address preview, order placement UI.

**Files:**
- `apps/web/src/routes/CartSummary.tsx` — Full cart page
- `apps/web/src/components/CartItemList.tsx` — Combined Food + Instamart display
- `apps/web/src/components/AddressPreview.tsx` — Generated address with map pin
- `apps/web/src/components/OrderTimingSelector.tsx` — Now vs Auto radio buttons
- `apps/web/src/components/PlaceOrderButton.tsx` — Debounced with loader + confirmation
- `apps/web/src/components/OrderNotesPreview.tsx` — Pre-populated notes display

**Dependencies:** cart store, API service
**Verification:** Cart totals correct; address preview shows; timing calculation displayed; double-submit blocked.

---

### Unit 17: Live Tracking Page
**Scope:** Real-time map with customer + rider positions, alignment dashboard.

**Files:**
- `apps/web/src/routes/LiveTracking.tsx` — Main page
- `apps/web/src/components/TrackingMap.tsx` — Map with dual markers
- `apps/web/src/components/AlignmentDashboard.tsx` — ETA comparison cards
- `apps/web/src/components/AlignmentStatusBadge.tsx` — EXCELLENT/GOOD/FAIR/POOR indicator
- `apps/web/src/components/CallRiderButton.tsx` — One-tap masked call
- `apps/web/src/components/NotificationToast.tsx` — Proximity alerts

**Dependencies:** tracking store, geolocation service, API service
**Verification:** GPS polling active; rider position updates; status changes reflect ETA drift; call button works.

---

### Unit 18: Error Handling & Recovery UI
**Scope:** Toast notifications, retry buttons, offline indicators, auth redirects.

**Files:**
- `apps/web/src/components/ToastProvider.tsx` — Toast container with variants
- `apps/web/src/components/NetworkStatus.tsx` — Online/offline indicator
- `apps/web/src/components/RetryButton.tsx` — Exponential backoff UI
- `apps/web/src/components/AuthRedirect.tsx` — Swiggy OAuth redirect handler
- `apps/web/src/components/ErrorBoundary.tsx` — React error boundary
- `apps/web/src/components/NoCoverageMessage.tsx` — Fallback when no Swiggy coverage

**Dependencies:** API service
**Verification:** Toasts show on errors; retry counts attempts; 401 triggers redirect; offline state detected.

---

### Unit 19: Mock ↔ Live Toggle
**Scope:** Environment-based switching between mock and live Swiggy endpoints.

**Files:**
- `apps/api/src/services/swiggy/config.ts` — Base URL selection from env
- `apps/web/.env.development` — `VITE_API_BASE=http://localhost:8787`
- `apps/web/.env.mock` — `VITE_MOCK_SWIGGY=true`
- `apps/mock-server/src/index.ts` — Ensure all endpoints match live shapes

**Dependencies:** All previous units
**Verification:** Toggle env var → API calls hit correct server; response shapes identical.

---

### Unit 20: Integration Tests
**Scope:** Test full flows end-to-end against mock backend.

**Files:**
- `apps/web/e2e/journey.spec.ts` — Input → route → intercepts
- `apps/web/e2e/browse.spec.ts` — Browse → cart → constraints
- `apps/web/e2e/order.spec.ts` — Place order → tracking
- `apps/api/tests/integration/routes.test.ts` — All API endpoints
- `apps/api/tests/integration/order-guard.test.ts` — Double-submit prevention
- `apps/api/tests/integration/oauth.test.ts` — PKCE flow

**Dependencies:** Playwright (web), Bun test (api)
**Verification:** All E2E tests pass against mock; all integration tests pass.

---

## Total Units: 21 (00–20)

## Estimated Build Order

| Phase | Units | Focus |
|-------|-------|-------|
| Foundation | 00–02 | Shared types, DB, API skeleton |
| Core Engine | 03–04 | Maps, route analysis, intercept algorithm |
| Integration | 05–08 | Mock server, Swiggy proxy, order service, API routes |
| Frontend Shell | 09–11 | React app, routing, state, API client |
| User Flows | 12–17 | Pages: input, route, browse, cart, track |
| Resilience | 18–19 | Errors, mock/live toggle |
| Verification | 20 | Full integration test suite |
