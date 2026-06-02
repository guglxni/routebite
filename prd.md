# RouteBite — Product Requirements Document

> **Status**: Inception Phase | **Version**: 2.0  
> **Goal**: Get hired by Swiggy via Builders Club  
> **Servers**: Food + Instamart (Dineout excluded)  

---

## 1. Product Vision

RouteBite is a **moving-target delivery orchestration engine** that enables bus, train, and car travelers in India to order Swiggy Food and Instamart essentials to ** dynamically calculated rendezvous points along their route**. Instead of delivering to a static address, RouteBite uses Google Maps Routes API with ML-based traffic-aware routing to compute optimal intercept points — scheduled stops, highway halts, petrol pumps, toll plazas, and even traffic lights — where a Swiggy delivery rider can meet the moving customer with minimal wait time.

### One-Sentence Pitch
> "Order biryani while you're on a bus, and pick it up at the next highway stop — timed to arrive exactly when your bus does."

---

## 2. Problem Statement

**23 million Indians travel by bus and train daily.** On long journeys (4-12 hours), travelers face:
- Unreliable, unhygienic highway food
- No way to get essentials (water, medicines, chargers) en route
- Bus rest stops with limited options, often overpriced
- Trains with pantry food that arrives cold or runs out

**Current options fail travelers:**
- IRCTC eCatering: Limited stations, unreliable timing, poor UX
- ZoopDelivery: Similar limitations, small coverage
- Swiggy app: Requires a static delivery address — useless on a moving bus

**RouteBite bridges the gap** by making Swiggy's delivery network location- and time-aware.

---

## 3. Target Users

| Segment | Journey Type | Pain Point | Order Type |
|---------|-------------|------------|-----------|
| Intercity bus passengers | 4-8h trips (Delhi-Jaipur, Bangalore-Chennai) | Bad highway food | Full meals |
| Train travelers | 6-24h journeys (Rajdhani, Shatabdi, sleeper) | Cold pantry food | Meals + essentials |
| Road trippers (car/bike) | 3-12h drives | No food options on remote routes | Meals + snacks |
| Urban bus commuters | 1-2h daily commute | No time to order before boarding | Quick snacks |
| Emergency travelers | Unexpected long journeys | Forgot essentials | Instamart only |

---

## 4. Functional Requirements

### FR-1: Journey Input

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | User enters origin (auto-detect via GPS or type) | P0 |
| FR-1.2 | User enters destination (type or select from suggestions) | P0 |
| FR-1.3 | User selects transport mode: Bus / Train / Car / Bike | P0 |
| FR-1.4 | User enters vehicle details: plate number, description, color, operator | P0 |
| FR-1.5 | User enters coach/seat/berth (for trains) | P1 |
| FR-1.6 | User enters bus route number (for scheduled bus stops) | P1 |
| FR-1.7 | App validates route is feasible (distance > 50km for intercept logic) | P1 |

### FR-2: Route Analysis & Intercept Detection

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | App calls Google Routes API v2 with TRAFFIC_AWARE_OPTIMAL | P0 |
| FR-2.2 | App computes route polyline, total distance, total duration | P0 |
| FR-2.3 | App identifies scheduled stops (bus rest areas, train stations) via Places API | P0 |
| FR-2.4 | App identifies traffic lights on urban bus routes | P1 |
| FR-2.5 | App identifies petrol pumps, toll plazas along route | P1 |
| FR-2.6 | App identifies safe dynamic pull-over points | P2 |
| FR-2.7 | App scores each intercept point by: dwell time, restaurant density, safety | P0 |
| FR-2.8 | App displays 3-5 top intercept points on interactive map | P0 |
| FR-2.9 | App shows ETA to each intercept point | P0 |
| FR-2.10 | App shows Swiggy coverage status at each point (Food/Instamart available yes/no) | P0 |

### FR-3: Rendezvous ML Algorithm

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Algorithm samples candidate points every 500m along route | P0 |
| FR-3.2 | Algorithm computes customer ETA to each point using live GPS + traffic prediction | P0 |
| FR-3.3 | Algorithm computes rider ETA from restaurant to each point using TWO_WHEELER routing | P0 |
| FR-3.4 | Algorithm calculates wait time = \|customerETA - riderETA\| | P0 |
| FR-3.5 | Algorithm scores each candidate: alignment + safety + restaurant proximity | P0 |
| FR-3.6 | Algorithm returns top-3 rendezvous candidates with timing details | P0 |
| FR-3.7 | Algorithm re-computes every 2 minutes using updated GPS positions | P1 |
| FR-3.8 | Algorithm handles route deviations by recalculating from current position | P1 |

### FR-4: Dual Server Browsing (Food + Instamart)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | At each intercept point, user can toggle between Food and Instamart tabs | P0 |
| FR-4.2 | Food tab calls Swiggy MCP `search_restaurants` for intercept location | P0 |
| FR-4.3 | Instamart tab calls Swiggy MCP `search_products` for intercept location | P0 |
| FR-4.4 | Food: Display restaurant list with ratings, cuisine, ETA, veg/non-veg | P0 |
| FR-4.5 | Instamart: Display product categories: Water, Snacks, Essentials, Medicines | P0 |
| FR-4.6 | Food: Show full menu with variants, add-ons, availability | P0 |
| FR-4.7 | Instamart: Show product with size variants, pricing, availability | P0 |
| FR-4.8 | Both servers show delivery ETA to the intercept point | P0 |
| FR-4.9 | Food cart: single restaurant only, enforce ₹1000 cap | P0 |
| FR-4.10 | Instamart cart: multi-product, enforce ₹99 minimum | P0 |
| FR-4.11 | Display restaurant product availability status (open/closed/busy) from API | P1 |

### FR-5: Cart & Address Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | Carts are maintained independently per server (Food ≠ Instamart) | P0 |
| FR-5.2 | Cart persists per intercept point; switching points warns about cart reset | P0 |
| FR-5.3 | Address is auto-generated: reverse geocode intercept lat/lng via Google Geocoding | P0 |
| FR-5.4 | Address includes landmark: "Near [known landmark], [highway name]" | P0 |
| FR-5.5 | Address label: "RouteBite Intercept — [Stop Name]" | P0 |
| FR-5.6 | User can edit/save address before ordering | P1 |
| FR-5.7 | Show bill breakdown: items, taxes, delivery fee, discount | P0 |
| FR-5.8 | Apply coupon via `fetch_food_coupons` (Food only) | P1 |
| FR-5.9 | Show estimated order total in paise (matches Swiggy API) | P0 |

### FR-6: Order Placement

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-6.1 | User can place order immediately or schedule auto-placement | P0 |
| FR-6.2 | Auto-placement time = interceptETA - prepTime - riderTravel - safetyBuffer | P0 |
| FR-6.3 | Order placement uses `place_food_order` (Food) or `checkout` (Instamart) | P0 |
| FR-6.4 | Non-idempotent guard: check `get_food_orders` before retry on failure | P0 |
| FR-6.5 | Order notes auto-populate: vehicle description, plate number, intercept instructions | P0 |
| FR-6.6 | Payment method: COD only (Swiggy constraint) | P0 |
| FR-6.7 | Show confirmation screen with order ID, estimated intercept time, vehicle details | P0 |
| FR-6.8 | Food order: warn if total exceeds ₹1000, block placement | P0 |
| FR-6.9 | Instamart order: warn if total below ₹99, suggest fillers | P0 |
| FR-6.10 | Multiple orders (Food + Instamart) placed independently, tracked together | P0 |

### FR-7: Live Tracking & Alignment

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7.1 | App polls customer GPS every 15-30 seconds | P0 |
| FR-7.2 | Backend polls Swiggy `track_food_order` / `track_order` for rider location | P0 |
| FR-7.3 | Display live alignment dashboard: customerETA vs riderETA vs order ready time | P0 |
| FR-7.4 | Show countdown: "Bus arrives in 28 min" / "Rider arrives in 24 min" | P0 |
| FR-7.5 | Alignment indicator: EXCELLENT / GOOD / FAIR / POOR based on time delta | P0 |
| FR-7.6 | Map view shows both customer (on route) and rider (free-moving) positions | P0 |
| FR-7.7 | Notify user of significant changes: "Rider delayed by 10 min" | P1 |
| FR-7.8 | One-tap call rider button | P0 |
| FR-7.9 | One-tap share location with rider | P1 |
| FR-7.10 | Store GPS traces in `tracking` table with 24h TTL | P1 |

### FR-8: Vehicle Handoff

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-8.1 | Notify user when rider arrives at intercept: "Your order is here!" | P0 |
| FR-8.2 | Notification includes rider name, vehicle description, photo if available | P1 |
| FR-8.3 | For traffic light intercepts: "Signal turning red in 30 sec — be ready!" | P2 |
| FR-8.4 | User marks handoff complete → order status updated | P0 |
| FR-8.5 | If handoff fails (bus leaves early), offer cancel (Food) or phone fallback (Instamart) | P1 |
| FR-8.6 | Post-handoff: prompt rating + feedback | P2 |

### FR-9: Error Handling & Resilience

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-9.1 | 401 Unauthorized → redirect to Swiggy OAuth re-auth | P0 |
| FR-9.2 | 419 Session revoked → full re-auth (phone + OTP) | P0 |
| FR-9.3 | 5xx / TIMEOUT → exponential backoff (4 attempts, max 30s) | P0 |
| FR-9.4 | 429 Rate limit → honor Retry-After header | P0 |
| FR-9.5 | Restaurant closed → suggest next intercept point or re-search | P0 |
| FR-9.6 | Route deviation → recalculate intercepts, notify user | P1 |
| FR-9.7 | Rider stuck in traffic → extend buffer, notify user of delay | P1 |
| FR-9.8 | GPS unavailable → fallback to route-based position prediction | P1 |
| FR-9.9 | No Swiggy coverage at intercept → suggest next point or show "no coverage" | P0 |
| FR-9.10 | Food order duplicate guard → check existing orders before retry | P0 |
| FR-9.11 | Cart address mismatch on point switch → warn + clear cart option | P0 |

### FR-10: Mock ↔ Live Swiggy MCP

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10.1 | Mock server runs on localhost:8788 with all Swiggy endpoints | P0 |
| FR-10.2 | Mock OAuth: authorization endpoint, token endpoint with 5-day expiry | P0 |
| FR-10.3 | Mock Food: all tools return realistic data (restaurants, menus, orders) | P0 |
| FR-10.4 | Mock Instamart: all tools return realistic data (products, stores, orders) | P0 |
| FR-10.5 | Single env var `MOCK_SWIGGY` toggles between mock and live | P0 |
| FR-10.6 | Mock and live endpoints have identical response shapes | P0 |

---

## 5. Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1.1 | Route analysis (Google API call) completes within 3 seconds | <3s |
| NFR-1.2 | Rendezvous algorithm returns candidates within 2 seconds | <2s |
| NFR-1.3 | Restaurant/product list loads within 1.5 seconds | <1.5s |
| NFR-1.4 | Order placement completes within 5 seconds end-to-end | <5s |
| NFR-1.5 | GPS polling interval: 15 seconds while active order exists | 15s |
| NFR-1.6 | Page load time (LCP) for PWA under 2 seconds on 4G | <2s |

### NFR-2: Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-2.1 | API availability: 99.5% uptime | 99.5% |
| NFR-2.2 | Order placement success rate: >99% (with retry logic) | >99% |
| NFR-2.3 | GPS tracking accuracy within 100 meters | <100m |
| NFR-2.4 | ETA prediction accuracy within 10% of actual arrival | <10% |

### NFR-3: Security & Privacy

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-3.1 | Swiggy user IDs hashed (SHA256) at rest | Always |
| NFR-3.2 | Access tokens encrypted in database (AES-256-GCM) | Always |
| NFR-3.3 | GPS data purged within 24 hours of session end | <24h |
| NFR-3.4 | No Swiggy PII persisted beyond session needs | Zero |
| NFR-3.5 | OAuth PKCE with S256 challenge | Always |
| NFR-3.6 | HTTPS only for all API calls | Always |
| NFR-3.7 | Rate limiting on backend: 100 req/min per IP | 100/min |

### NFR-4: Scalability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-4.1 | Backend handles 1000 concurrent sessions | 1000 |
| NFR-4.2 | Database supports 1M routes, 10M orders | 1M/10M |
| NFR-4.3 | PWA works offline for viewing cached routes | Yes |

### NFR-5: Accessibility

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-5.1 | WCAG 2.1 AA compliance | AA |
| NFR-5.2 | Supports screen readers for all interactive elements | Yes |
| NFR-5.3 | Minimum touch target: 44×44dp | 44dp |
| NFR-5.4 | Color contrast ratio ≥ 4.5:1 for text | ≥4.5:1 |

### NFR-6: Mobile & PWA

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-6.1 | Installable as PWA with manifest + service worker | Yes |
| NFR-6.2 | Works on Android Chrome, iOS Safari | Both |
| NFR-6.3 | Responsive: 320px to 768px primary range | Yes |
| NFR-6.4 | Battery-optimized GPS (low power mode when app backgrounded) | Yes |

---

## 6. User Stories

### Story 1: The Hungry Bus Passenger
> As a bus passenger on a 6-hour Delhi-to-Jaipur journey, I want to order a hot meal that will be ready when my bus stops at Neemrana, so I don't have to eat the stale sandwich from the bus vendor.

**Acceptance Criteria:**
- I enter my bus details (VRL-7845, red Volvo, Delhi→Jaipur)
- App shows Neemrana as a high-quality intercept point
- I browse restaurants, add biryani + naan to cart
- App auto-places order at 1:45 PM (calculated timing)
- At 2:45 PM, my bus stops and the rider hands me the food

### Story 2: The Forgetful Train Traveler
> As a train passenger who forgot my phone charger, I want to order one from Instamart at the next major station, so I can charge my phone before my 12-hour journey ends.

**Acceptance Criteria:**
- I'm on a train to Chennai, currently at Salem Jn
- App shows upcoming stations with Instamart coverage
- I search "charger" at Erode station
- Add charger to Instamart cart (₹199, above ₹99 minimum)
- Order placed, rider meets me at Erode platform

### Story 3: The Urban Commuter
> As a daily bus commuter in Bangalore, I want to grab a quick dosa at a traffic light intercept, so I don't have to skip breakfast.

**Acceptance Criteria:**
- I enter my regular bus route (201, Koramangala→MG Road)
- App detects urban route and shows traffic light intercepts
- I see 4th Cross Junction coming up in 8 min
- I order masala dosa + coffee (quick prep items)
- Rider arrives at traffic light, hands me food when bus stops at red

### Story 4: The Road Tripper
> As someone driving from Bangalore to Goa, I want to order food at a petrol pump intercept, so I don't waste time detouring into towns for lunch.

**Acceptance Criteria:**
- I enter car mode, Bangalore→Goa
- App shows petrol pumps with restaurant coverage
- I select a pump 3 hours into the journey
- Order auto-placed 45 min before I arrive
- Food ready when I stop for fuel

### Story 5: The Multi-Stop Planner
> As a traveler, I want to order food at one stop and Instamart essentials at another, all in one journey plan.

**Acceptance Criteria:**
- I plan Delhi→Jaipur route
- Stop 1 (Neemrana): Order lunch from Food server
- Stop 2 (Shahjahanpur): Order water + snacks from Instamart
- Both orders tracked independently on same dashboard
- Pick up food at Stop 1, Instamart at Stop 2

---

## 7. Competitive Analysis

| Competitor | Approach | RouteBite Advantage |
|-----------|----------|-------------------|
| **IRCTC eCatering** | Station-based pre-orders only | Dynamic intercepts anywhere on route, not just stations |
| **ZoopDelivery** | Group orders at stations | Individual orders, real-time coordination, both Food + Instamart |
| **Railyatri** | Train info + food ordering | No delivery integration, no live coordination |
| **Swiggy app** | Static address only | Moving target, time-aware ordering, intercept optimization |
| **Food on Track (IRCTC)** | Limited trains, limited stations | Any vehicle, any route, any intercept point |

**No direct competitor** offers ML-optimized rendezvous calculation with live two-way tracking.

---

## 8. Success Metrics

Since this is a **recruiting portfolio project**, success is measured by:

| Metric | Target | How Measured |
|--------|--------|-------------|
| Swiggy application response | Interview invitation | Wait for response |
| Demo video views | >100 | Loom analytics |
| GitHub stars | >50 | GitHub insights |
| End-to-end demo flow works | 100% | Manual testing |
| Code coverage | >70% | Vitest coverage |
| Lighthouse score | >90 | Chrome DevTools |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Swiggy rejects /access application | Medium | High | Build against mock, submit with polished demo |
| Google Maps API costs ($5-10/day heavy use) | Low | Medium | Use mock maps for most dev; live only for recordings |
| Rider can't find moving vehicle | Medium | Medium | Detailed vehicle description + phone coordination |
| Bus/train delayed significantly | High | Medium | Safety buffer in timing; notify user; rider waits at stop |
| No Swiggy coverage at intercept | Medium | High | Check coverage before showing point; suggest next |
| GPS drains battery | Medium | Low | 15s interval, low-power mode, optional manual refresh |
| Mock → Live parity gaps | Medium | High | Extensive mock validation against real endpoints |

---

## 10. Out of Scope (v1.0)

| Feature | Reason | Future |
|---------|--------|--------|
| Dineout server | "Restaurants don't run away" — irrelevant for moving targets | v2.0 for end-of-journey |
| Refresh tokens | Swiggy v1.0 doesn't wire them | v1.1 when available |
| Widget hosting | Capability advertised but not live | When Swiggy enables |
| Real money payments | COD only per Swiggy constraints | If Swiggy adds |
| Push notifications | Requires FCM setup, skip for demo | v1.1 |
| Apple Wallet / passes | No NFC handoff for demo | v2.0 |
| Multi-city/multi-modal | Single route, single mode only | v2.0 |

---

## 11. Open Questions

1. **Can delivery riders actually access buses?** — Some operators allow, others don't. Mitigate with platform/station handoff.
2. **What if the bus skips an unscheduled stop?** — Rider waits; order times out; notification sent; user requests cancellation or redirect.
3. **Swiggy delivery radius at highway locations?** — Some remote stops may have no coverage. Pre-check before showing intercept.
4. **Traffic light data accuracy?** — Google Maps doesn't expose traffic light locations directly. May need OpenStreetMap overlay.
5. **IRCTC live train data?** — No free PNR API. Fallback: manual schedule + user-entered delay estimates.

---

*PRD version 2.0 — 2026-05-08*  
*Next step: AIDLC Inception Phase → Construction Phase*
