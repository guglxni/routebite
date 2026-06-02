# RouteBite — Workflow Plan

## 1. System Decomposition

### Container Diagram (Conceptual)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    User Device (PWA)                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ React 19 SPA │  │ ServiceWorker│  │  IndexedDB   │  │     Geolocation API          │ │
│  │ (Map UI)     │  │ (Offline)    │  │ (Cache)      │  │     (Customer GPS)           │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ HTTP/WebSocket
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Hono API (Bun)                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ Route        │  │ Intercept    │  │ Order Sync   │  │ Session /                    │ │
│  │ Controller   │  │ Controller   │  │ Controller   │  │ Auth Controller              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ Google Maps  │  │  Swiggy MCP  │  │  Turso DB    │  │  Mock MCP Server             │ │
│  │   Client     │  │   Proxy      │  │  (SQLite)    │  │  (dev only)                  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Tech |
|-----------|---------------|------|
| `apps/web` | React SPA — map UI, cart, order flow, tracking | React 19, Vite, Tailwind, Google Maps JS |
| `apps/api` | Hono server — route analysis, MCP proxy, DB | Hono, Bun, Drizzle ORM, libSQL |
| `apps/api/src/services/maps/` | Google Routes v2, Geocoding, Places clients | REST, cache |
| `apps/api/src/services/swiggy/` | MCP proxy ↔ Swiggy/live, auth, token mgmt | OAuth 2.1 PKCE |
| `apps/api/src/services/intercept/` | ML rendezvous algorithm, scoring, recalc | Pure functions, tested |
| `apps/api/src/services/order/` | Order placement, timing, guard logic | Idempotency patterns |
| `apps/api/src/services/tracking/` | GPS polling, ETA alignment, notifications | SSE or polling |
| `packages/db` | Shared Drizzle schema, migrations | SQLite, Turso |
| `packages/shared` | Shared types, validation schemas | Zod |

### Data Flow

```
[User inputs journey]
      │
      ▼
[Route Controller] → [Google Maps Client] → [Routes API v2]
      │
      ▼
[Intercept Controller] → [Intercept Service] → [Places API]
      │
      ▼
[User selects intercept + server]
      │
      ▼
[Swiggy MCP Proxy] → [Restaurant / Product Search]
      │
      ▼
[Order Sync Controller] → [Address Gen → Order Placement]
      │
      ▼
[Tracking Service] → [GPS Polling ← Swiggy Tracking]
      │
      ▼
[Alignment Dashboard]
```

---

## 2. Transaction & State Boundaries

### Critical Transactions

| Transaction | Nature | Rollback Strategy |
|-------------|--------|-------------------|
| OAuth handshake | 2-phase (auth → token) | PKCE verifier timeout, retry from start |
| Order placement | Non-idempotent | Check-then-retry via `get_food_orders` |
| Cart address change | Destructive (cart clear) | Warn user, require confirmation |
| Intercept recalculation | Read + update | Soft invalidate, keep old until new ready |

### State Machine: Order Lifecycle

```
[INIT] → [ROUTE_SELECTED] → [INTERCEPT_CHOSEN] → [CART_READY]
  │            │                    │                    │
  ▼            ▼                    ▼                    ▼
[ABANDONED] [ROUTE_CHANGED]  [INTERCEPT_CHANGED]  [ADDRESS_GENERATED]
                                                      │
                                                      ▼
                                              [ORDER_PLACED] → [CONFIRMED]
                                                                   │
                                                ┌─────────────────┼─────────────────┐
                                                ▼                 ▼                 ▼
                                           [TRACKING]      [RIDER_DELAYED]    [ROUTE_DEVIATED]
                                                │                 │                 │
                                                ▼                 ▼                 ▼
                                           [DELIVERED]     [RECALC_INTERCEPT] [RECALC_ROUTE]
```

---

## 3. Data Flow Architecture

### Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Hashed Swiggy ID, encrypted tokens |
| `journeys` | Origin, destination, route polyline, transport mode |
| `intercepts` | Lat/lng, type, score, ETA, associated journey |
| `orders` | Swiggy order ID, server (food/instamart), status, timing |
| `tracking_events` | GPS samples, rider positions, alignment snapshots |
| `sessions` | OAuth tokens, expiry, encrypted at rest |

### API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/routes/analyze` | POST | Analyze route, return intercepts |
| `/api/v1/intercepts/[id]/restaurants` | GET | Food restaurants at intercept |
| `/api/v1/intercepts/[id]/products` | GET | Instamart products at intercept |
| `/api/v1/cart/validate` | POST | Validate cart constraints |
| `/api/v1/orders` | POST | Place order with address generation |
| `/api/v1/orders/[id]/track` | GET | Live tracking stream |
| `/api/v1/orders/[id]/cancel` | POST | Cancel (Food only) |
| `/api/v1/auth/swiggy` | GET | Initiate OAuth PKCE |
| `/api/v1/auth/callback` | GET | OAuth callback |

---

## 4. Resilience & Error Handling Rules

| Scenario | Rule |
|----------|------|
| Swiggy 401 | Redirect to `/api/v1/auth/swiggy` immediately |
| Swiggy 419 | Full re-auth (invalidate tokens, clear session, start fresh) |
| Swiggy 5xx / TIMEOUT | Exponential backoff: 1s, 2s, 4s, 8s (max 15s total). On 4th failure: surface error + retry button. |
| Swiggy 429 | Parse `Retry-After`, queue or bypass. Budget: 30s max wait. |
| Google Maps 403 | Log, fallback to cached route or manual station picker |
| GPS unavailable | Use last known position + route interpolation. Show "approximate" indicator. |
| Cart constraint violation | Block checkout, show inline error, highlight offending items |
| Order double-submit | UI debounce (500ms) + `confirmed: true` + `get_food_orders` pre-check |
| Offline | SW caches static assets + last route. Order placement blocked, queued for reconnect. |

---

## 5. Cross-Cutting Concerns

| Concern | Implementation |
|---------|---------------|
| Auth | OAuth 2.1 PKCE + S256; tokens encrypted (AES-256-GCM); no refresh in v1.0 |
| Rate Limiting | 100 req/min per IP (API); 10 req/min per user (Swiggy proxy) |
| Logging | Structured JSON; no PII in logs; GPS coords truncated to 3 decimal places |
| GDPR/DPDP | User IDs hashed (SHA256); GPS purged <24h; no persistent order data beyond session |
| Observability | Request tracing via `X-Request-ID`; per-endpoint latency metrics |
| Testing | Vitest + jsdom (frontend); Bun test (backend); integration tests for MCP proxy |

---

## 6. Technology Constraints

| Constraint | Rationale |
|------------|-----------|
| React 19 + Vite (Bun) | Fast builds, modern React features |
| Hono on Bun | Lightweight, fast cold-start, native Bun APIs |
| SQLite (libSQL/Turso) | Edge-deployable, zero-config for demo |
| Google Maps JS API (client-side) | Route rendering, user location |
| Google Routes API v2 (server-side) | Server-side route analysis, key protection |
| Drizzle ORM | Type-safe, migration support |
| Tailwind CSS | Utility-first, rapid UI development |

---

## 7. Mock ↔ Live Transition Plan

| Phase | Action |
|-------|--------|
| 1 | Build mock MCP server (`localhost:8788`) replicating all Swiggy endpoints |
| 2 | Develop frontend against mock, test all flows |
| 3 | Apply for Swiggy `client_id` via `/access` |
| 4 | Swap `MCP_BASE` env var; add `isMock` runtime check |
| 5 | Validate OAuth flow, rate limits, real order placement |

---

*Workflow Plan | 2026-05-08*
