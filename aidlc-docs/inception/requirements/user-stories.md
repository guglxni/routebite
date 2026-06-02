# RouteBite — User Stories

## Personas

### P1: Priya, the Intercity Bus Passenger
- **Demographics**: 25, graduate student, traveling by intercity bus weekly
- **Needs**: Hot meal at highway stop, doesn't know which restaurants exist there
- **Pain points**: Starving through 8-hour journeys, bus stops have poor food options
- **Device**: Mid-range Android, 4G connection, spotty at stops

### P2: Arjun, the Train Commuter
- **Demographics**: 32, IT professional, daily train commuter
- **Needs**: Forgot essentials (charger, meds, snacks) — needs them at next station
- **Pain points**: No time to stop at platform, carrying heavy bags
- **Device**: iPhone 15, good network on train routes

### P3: Sneha, the Road Tripper
- **Demographics**: 28, travel influencer, long road trips in car
- **Needs**: Order ahead for petrol pump stop, avoid wasting travel time
- **Pain points**: Has to detour for food, delivery addresses hard to describe
- **Device**: iPhone mounted on dashboard, occasional dead zones

### P4: Rahul, the Urban Commuter
- **Demographics**: 24, rideshare passenger, daily urban commute
- **Needs**: Quick snack at predictable traffic light stop
- **Pain points**: Always hungry during commute, no predictable delivery spot
- **Device**: Android flagship, urban 5G

### P5: Swiggy Builder (Demo Audience)
- **Demographics**: Swiggy recruiting team, technical reviewers
- **Needs**: See multi-server composition, novel intercept algorithm, production resilience
- **Pain points**: Generic portfolio projects, lack of real-world constraints

---

## User Stories

### SB-001: Initiate Journey Flow (Priya, Sneha)
**As a** traveler  
**I want to** input my origin, destination, vehicle type, and route  
**So that** the system can find valid delivery interception points along my journey

**Acceptance Criteria:**
- AC1: User inputs origin (searchable, geocoded) and destination (searchable, geocoded)
- AC2: User selects transport mode: Bus, Train, Car, Bike, Metro, Walk
- AC3: User enters vehicle details: plate number (optional), color, description
- AC4: User confirms route from Google Maps alternatives (fastest, shortest, scenic)
- AC5: System validates route is at least 5km and under 500km

**Tests:** [Future] End-to-end journey input → route validation

---

### SB-002: View Intercept Points (All Personas)
**As a** traveler  
**So that** I can see where my delivery could be handed over

**Acceptance Criteria:**
- AC1: Map displays route as polyline with numbered intercept markers
- AC2: Each marker shows type icon (🚦 traffic light, ⛽ petrol pump, 🚏 stop, 🔵 toll)
- AC3: Tapping marker opens sheet with: dwell time, restaurants nearby, safety rating
- AC4: System scores each point 0-100 — only ≥60 shown by default
- AC5: Points can be filtered by type, re-scored by preference (speed vs restaurant choice)
- AC6: At least 3 points are shown for any valid route

**Tests:** [Future] Route analysis → intercept scoring → UI rendering

---

### SB-003: Browse Food at Intercept (Priya, Rahul)
**As a** hungry traveler  
**I want to** browse restaurants near my chosen intercept point  
**So that** I can order a meal for pickup there

**Acceptance Criteria:**
- AC1: Tapping intercept opens Food tab showing restaurants sorted by ETA match
- AC2: Restaurants display: name, cuisine, rating, ETA from intercept, distance
- AC3: Tapping restaurant opens menu grouped by: Recommended, Veg Only, Bestsellers
- AC4: Menu items show: name, description, price, image, customizable variants
- AC5: Adding item to cart enforces single-restaurant constraint
- AC6: Cart total ≤ ₹1000 enforced at UI level
- AC7: Cart persists across intercept point changes (but restaurant must be valid at new point)

**Tests:** [Future] Restaurant fetch → menu render → cart constraint enforcement

---

### SB-004: Browse Instamart at Intercept (Arjun)
**As a** traveler needing essentials  
**I want to** browse Instamart products near my intercept point  
**So that** I can order forgotten items for pickup there

**Acceptance Criteria:**
- AC1: Tapping intercept opens Instamart tab showing product categories
- AC2: Products display: name, brand, size variants, price, availability
- AC3: Search filters: categories, brand, dietary (veg/gluten-free/organic)
- AC4: Adding to cart allows multi-product selection
- AC5: Cart minimum ₹99 enforced at checkout
- AC6: Cart persists across intercept point changes

**Tests:** [Future] Product fetch → cart minimum enforcement

---

### SB-005: Switch Between Food and Instamart (All Personas)
**As a** traveler  
**I want to** toggle between Food and Instamart within the same intercept point  
**So that** I can compose a multi-server order

**Acceptance Criteria:**
- AC1: Tab bar shows Food (with cart count) and Instamart (with cart count)
- AC2: Switching tabs preserves scroll position
- AC3: Both carts are independent (Food cart ≠ Instamart cart)
- AC4: Total order summary shows: Food subtotal + Instamart subtotal + grand total

**Tests:** [Future] Tab switch → cart isolation → summary aggregation

---

### SB-006: Place Food Order (Priya)
**As a** traveler  
**I want to** place my food order with automatic timing  
**So that** it arrives right when I do at the intercept point

**Acceptance Criteria:**
- AC1: Auto-generated address: reverse geocoded street + "RouteBite Intercept" landmark label
- AC2: Order timing options: "Place Now" or "Auto-place" (system calculates optimal time)
- AC3: Auto-place formula: interceptETA - prepTime - riderTravel - safetyBuffer(10min) - trafficBuffer(5min)
- AC4: Order Notes auto-populate with: "Vehicle: [description]. Plate: [plate]. Intercept at: [point name]. Look for [color] vehicle."
- AC5: Double-submit protection: debounce UI + `confirmed: true` + check `get_food_orders` before retry
- AC6: On success, show order confirmation with: order ID, expected intercept time, tracking button

**Tests:** [Future] Address generation → timing calculation → idempotency guard → order placement

---

### SB-007: Track Live Order (All Personas)
**As a** traveler with an active order  
**I want to** see real-time alignment between my journey and the rider  
**So that** I know if the handoff will work

**Acceptance Criteria:**
- AC1: Customer position updates every 15s via GPS polling
- AC2: Rider position updates via Swiggy track API polling
- AC3: Map shows: customer on route (blue dot), rider free-moving (orange dot), intercept (green pin)
- AC4: Alignment dashboard shows: customerETA, riderETA, orderReadyTime, overall status
- AC5: Status indicator: EXCELLENT (all aligned) / GOOD (within 5min) / FAIR (within 10min) / POOR (misaligned)
- AC6: One-tap call rider button (masked number)
- AC7: Notification: "Order arriving in 10 min" when rider is 10 min away
- AC8: Notification: "You're arriving in 5 min — order should be ready"

**Tests:** [Future] GPS polling → ETA alignment → status calculation → notification trigger

---

### SB-008: Handle Order Issues (All Personas)
**As a** traveler  
**I want to** handle problems if something goes wrong  **So that** I'm not stranded without my order

**Acceptance Criteria:**
- AC1: If rider delayed >15min: suggest extending intercept dwell, offer to chat/call rider
- AC2: If route deviates >2km: recalculate intercepts, notify user, suggest updating order
- AC3: If restaurant closed after order placed: suggest next intercept point, offer refund
- AC4: If no Swiggy coverage: show "no coverage" with option to try next point or cancel
- AC5: 401 Unauthorized → redirect to Swiggy OAuth re-auth flow
- AC6: 5xx/TIMEOUT → exponential backoff retry, show status after 4 attempts

**Tests:** [Future] Each error scenario → recovery flow

---

### SB-009: Mock ↔ Live Toggle (Developer, Demo)
**As a** developer or demo audience  
**I want to** switch between mock and live Swiggy endpoints instantly  **So that** the demo works without Swiggy approval

**Acceptance Criteria:**
- AC1: Environment variable `VITE_MOCK_SWIGGY=true/false` toggles behavior
- AC2: Mock server runs on `localhost:8788` with same endpoint shapes as live
- AC3: OAuth flow works identically against mock authorization server
- AC4: Order placement stores in local SQLite instead of Swiggy backend when mocked

**Tests:** [Future] Toggle → mock handshake → mock order → mock tracking

---

### SB-010: Multi-Stop Journey Planning (Sneha)
**As a** road tripper  
**I want to** plan multiple delivery stops along my route  **So that** I can order Food at one stop and Instamart at another

**Acceptance Criteria:**
- AC1: After placing order at intercept A, system suggests next intercept B
- AC2: Each intercept has independent Food + Instamart browsing
- AC3: Active orders from multiple intercepts tracked on single dashboard
- AC4: Cart clears automatically when switching to a new restaurant at same intercept
- AC5: Address changes require cart clear (both Food and Instamart)

**Tests:** [Future] Multi-intercept flow → cart isolation → dashboard aggregation

---

## Story → Persona Mapping

| Story | Priya | Arjun | Sneha | Rahul | Demo |
|-------|:-----:|:-----:|:-----:|:-----:|:----:|
| SB-001 Initiate Journey | ✓ | ✓ | ✓ | ✓ | |
| SB-002 View Intercepts | ✓ | ✓ | ✓ | ✓ | |
| SB-003 Browse Food | ✓ | | | ✓ | |
| SB-004 Browse Instamart | | ✓ | | | |
| SB-005 Toggle Servers | | | ✓ | | ✓ |
| SB-006 Place Order | ✓ | | ✓ | ✓ | |
| SB-007 Live Tracking | ✓ | ✓ | ✓ | ✓ | ✓ |
| SB-008 Handle Issues | ✓ | ✓ | ✓ | ✓ | |
| SB-009 Mock Toggle | | | | | ✓ |
| SB-010 Multi-Stop | | | ✓ | | |

## Priority Matrix

| Story | Business Value | Technical Risk | Priority |
|-------|---------------|----------------|----------|
| SB-001 | High | Medium | P0 |
| SB-002 | High | High | P0 |
| SB-003 | High | Medium | P0 |
| SB-004 | High | Medium | P0 |
| SB-005 | Medium | Low | P0 |
| SB-006 | High | High | P0 |
| SB-007 | High | High | P0 |
| SB-008 | Medium | Medium | P1 |
| SB-009 | High | Low | P0 |
| SB-010 | Medium | Medium | P1 |
