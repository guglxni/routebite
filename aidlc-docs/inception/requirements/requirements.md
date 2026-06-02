# RouteBite — Requirements Analysis

## Intent Analysis

| Attribute | Value |
|-----------|-------|
| **User Request** | Build a moving-target delivery orchestration engine on Swiggy MCP that lets bus/train/car travelers order Food + Instamart to dynamically calculated rendezvous points along their route using Google Maps ML routing. Portfolio project for Swiggy Builders Club recruiting. |
| **Request Type** | New Project (Greenfield) |
| **Scope Estimate** | System-wide — full-stack PWA with backend API, third-party integrations, ML routing, real-time tracking |
| **Complexity Estimate** | Complex — multi-server composition, OAuth PKCE, non-idempotent order guards, live GPS coordination, novel intercept algorithm |

## Functional Requirements

### Core Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-001 | Accept journey input: origin, destination, transport mode, vehicle details | P0 |
| REQ-002 | Compute route via Google Routes API v2 (TRAFFIC_AWARE_OPTIMAL) | P0 |
| REQ-003 | Identify intercept point types: scheduled stops, traffic lights, petrol pumps, toll plazas, dynamic safe pull-overs | P0 |
| REQ-004 | Score intercept points by: dwell time, restaurant density, safety, feasibility | P0 |
| REQ-005 | ML Rendezvous Algorithm: compute customer ETA + rider ETA for candidate points; minimize wait time | P0 |
| REQ-006 | Two-trajectory optimization: customer route + rider origin considered simultaneously | P0 |
| REQ-007 | Recalculate intercepts every 2 minutes using live GPS | P1 |
| REQ-008 | Handle route deviations by recalculating from current position | P1 |

### Dual-Server Browsing

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-009 | Food server: search restaurants at intercept location via Swiggy MCP | P0 |
| REQ-010 | Food server: display menu with variants, add-ons, availability | P0 |
| REQ-011 | Instamart server: search products at intercept location via Swiggy MCP | P0 |
| REQ-012 | Instamart server: display product categories, size variants, availability | P0 |
| REQ-013 | Toggle between Food and Instamart at each intercept point | P0 |
| REQ-014 | Food cart: single restaurant only, enforce ₹1000 cap | P0 |
| REQ-015 | Instamart cart: multi-product, enforce ₹99 minimum | P0 |

### Order Placement

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-016 | Auto-generate delivery address: reverse geocode intercept lat/lng via Google Geocoding | P0 |
| REQ-017 | Address includes landmark + "RouteBite Intercept" label | P0 |
| REQ-018 | Order timing: place now OR auto-place at calculated optimal time | P0 |
| REQ-019 | Auto-place time = interceptETA - prepTime - riderTravel - safetyBuffer - trafficBuffer | P0 |
| REQ-020 | Non-idempotent guard: check `get_food_orders` before retry on `place_food_order` failure | P0 |
| REQ-021 | Order notes auto-populate with vehicle description, plate number, intercept instructions | P0 |
| REQ-022 | COD only (Swiggy constraint) | P0 |
| REQ-023 | Multiple orders (Food + Instamart) placed independently, tracked together | P0 |

### Live Tracking

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-024 | Poll customer GPS every 15 seconds while active order exists | P0 |
| REQ-025 | Poll Swiggy `track_food_order` / `track_order` for rider location | P0 |
| REQ-026 | Display alignment dashboard: customerETA vs riderETA vs orderReadyTime | P0 |
| REQ-027 | Alignment indicator: EXCELLENT / GOOD / FAIR / POOR | P0 |
| REQ-028 | Map shows customer (on route) + rider (free-moving) positions | P0 |
| REQ-029 | One-tap call rider button | P0 |
| REQ-030 | GPS data session-scoped, purged within 24 hours | P0 |

### Error Resilience

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-031 | 401 Unauthorized → redirect to Swiggy OAuth re-auth | P0 |
| REQ-032 | 419 Session revoked → full re-auth (phone + OTP) | P0 |
| REQ-033 | 5xx / TIMEOUT → exponential backoff (4 attempts, max 30s) | P0 |
| REQ-034 | 429 Rate limit → honor Retry-After header | P0 |
| REQ-035 | Restaurant closed → suggest next intercept or re-search | P0 |
| REQ-036 | No Swiggy coverage → suggest next point or "no coverage" message | P0 |
| REQ-037 | Rider delayed → extend buffer, notify customer | P1 |
| REQ-038 | Route deviation → recalculate intercepts | P1 |

### Mock ↔ Live

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-039 | Mock Swiggy MCP on localhost:8788 with all endpoints | P0 |
| REQ-040 | Single env var `MOCK_SWIGGY` toggles mock ↔ live | P0 |
| REQ-041 | Mock and live endpoints have identical response shapes | P0 |

## Non-Functional Requirements

### Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-001 | Route analysis completes within 3 seconds | <3s |
| NFR-002 | Rendezvous algorithm returns candidates within 2 seconds | <2s |
| NFR-003 | Restaurant/product list loads within 1.5 seconds | <1.5s |
| NFR-004 | Order placement completes within 5 seconds | <5s |
| NFR-005 | Page load time (LCP) under 2 seconds on 4G | <2s |

### Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-006 | Order placement success rate with retry logic | >99% |
| NFR-007 | GPS tracking accuracy | <100m |
| NFR-008 | ETA prediction accuracy | <10% |

### Security & Privacy (SECURITY extension enabled)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-009 | Swiggy user IDs hashed (SHA256) at rest | Always |
| NFR-010 | Access tokens encrypted in database (AES-256-GCM) | Always |
| NFR-011 | GPS data purged within 24 hours | <24h |
| NFR-012 | No Swiggy PII persisted beyond session needs | Zero |
| NFR-013 | OAuth PKCE with S256 | Always |
| NFR-014 | HTTPS only for all API calls | Always |
| NFR-015 | Rate limiting: 100 req/min per IP | 100/min |

### Scalability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-016 | Backend handles 1000 concurrent sessions | 1000 |
| NFR-017 | PWA works offline for viewing cached routes | Yes |

### Accessibility

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-018 | WCAG 2.1 AA compliance | AA |
| NFR-019 | Minimum touch target 44×44dp | 44dp |
| NFR-020 | Color contrast ratio ≥ 4.5:1 | ≥4.5:1 |

## User Scenarios

See `spec.md` §6 and `prd.md` §6 for detailed flows. Key scenarios:
1. Intercity bus passenger orders meal at highway stop
2. Train traveler orders forgotten essentials at next station
3. Urban commuter grabs quick snack at traffic light intercept
4. Road tripper orders food at petrol pump
5. Multi-stop planner: Food at stop 1, Instamart at stop 2

## Business Context

| Dimension | Detail |
|-----------|--------|
| **Goal** | Impress Swiggy recruiting team via Builders Club |
| **Target** | Interview invitation — not commercial launch |
| **Signal areas** | Multi-server composition, context-aware ordering, novel map-first UI, production resilience |
| **Servers** | Food + Instamart only (Dineout excluded) |
| **Constraints** | COD only, ₹1000 food cap, ₹99 Instamart min, no cancel for Instamart |
| **Data compliance** | Swiggy is Data Fiduciary; RouteBite acts as Data Processor (DPDP 2023) |

## Technical Context

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, Google Maps JS API |
| Backend | Hono (Bun), Drizzle ORM, SQLite (libSQL/Turso) |
| Swiggy Integration | MCP via OAuth 2.1 PKCE + S256 |
| Maps | Google Routes API v2, Geocoding API, Places API |
| Transport ETA mapping | Car→DRIVE, Bike→TWO_WHEELER, Train/Bus→TRANSIT/DRIVE, Walk→WALK |

## Quality Attributes

| Attribute | Approach |
|-----------|----------|
| **Reliability** | Exponential backoff, check-then-retry, 401/419 guards |
| **Maintainability** | Monorepo with clean separation (apps/web, apps/api) |
| **Testability** | Vitest + jsdom frontend, integration tests for MCP proxy + mock |
| **Property-Based Testing** | Partial mode — round-trip tests for serialization, coordinate transforms |

---

*Requirements documented from spec.md + prd.md | 2026-05-08*
