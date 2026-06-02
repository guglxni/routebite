# RouteBite — Product Specification

> **Status**: Inception Phase  
> **Goal**: Get hired by Swiggy via Builders Club by building something genuinely impressive on Swiggy MCP  
> **Servers**: Food + Instamart (Dineout excluded — travelers can't dine-out while en route)  

---

## 1. Product Thesis

**RouteBite is a moving-target delivery orchestration engine.** It treats the customer as a moving object on a known trajectory and the delivery rider as an intercept agent who navigates to a dynamically calculated rendezvous point. Instead of delivering to a static address, RouteBite computes where the traveler and rider can meet with minimal wait time — at bus stops, highway restaurants, petrol pumps, **traffic lights**, stations, or any point along the route.

### The "Rendezvous" Model

| Traditional Delivery | RouteBite Delivery |
|---------------------|-------------------|
| Rider → static address → waits for user | Rider + user move toward calculated intercept point → meet dynamically |
| User is destination | User is a moving target; rider is intercept agent |
| Fixed time window | Optimized arrival-time alignment via ML routing |

The rider **catches up** to the user's journey. The system optimizes the meeting point in real time using Google Maps Routes API with traffic-aware ML routing, considering both trajectories simultaneously.

---

## 2. Dual-Server Architecture: Food + Instamart as Equals

RouteBite is **not a food app with Instamart as an add-on**. Both servers are first-class citizens in every user session.

| Dimension | Food Server | Instamart Server |
|-----------|------------|-------------------|
| **Use case** | Hot meals, snacks, beverages en route | Travel essentials, emergency items, refills |
| **Timing** | Prep-time critical (15-40 min) | Faster fulfillment (5-15 min) |
| **Intercept** | Requires early order (30-60 min ahead) | Can be ordered closer to intercept (15-30 min) |
| **Cart rules** | Single restaurant, ₹1000 cap | Multi-product, ₹99 minimum |
| **Cancelable?** | Yes via cancel_food_order | No — fallback phone UI |
| **Examples** | Biryani at highway stop, dosa at station | Water bottles, phone charger, painkillers, masks |

A single journey often involves **both**: "Get me lunch from the Food server at Neemrana and a water bottle + charger from Instamart at the same stop." The app coordinates both orders independently but presents them as one unified experience.

---

## 3. Intercept Point Types

RouteBite recognizes multiple intercept categories, ranked by feasibility:

### 3.1 Scheduled Stops (Highest Confidence)

| Type | Examples | Dwell Time | Best For |
|------|----------|-----------|----------|
| Bus rest stops | Highway dhabas, food courts | 15-30 min | Full meals |
| Train stations | Platforms, station entrances | 5-20 min | Quick meals, essentials |
| Toll plazas | NH toll booths with food courts | 10-15 min | Snacks, tea |
| Petrol pumps | Highway fuel stations | 10-15 min | Instamart essentials |

### 3.2 Traffic Light Intercepts (Urban Innovation)

**Novel intercept mode for city bus routes and car journeys.**

- Buses in cities stop at traffic lights every 2-5 minutes
- Rider on a two-wheeler navigates through traffic faster than a bus/car
- Rider reaches an **upcoming traffic light** on the user's route, waits for the vehicle to arrive at red
- Handoff happens in 30-90 seconds while the light is red
- **Requirements**: Known route (bus follows fixed path), real-time GPS, rider on two-wheeler

```
Scenario: Bangalore city bus route
├─ Bus GPS: approaching 4th cross junction
├─ Rider location: 800m from same junction, on bike
├─ Rider ETA to junction: 3 min (via two-wheeler routing)
├─ Bus ETA to junction: 5 min (with traffic delays)
├─ Intercept score: GOOD (2 min buffer)
└─ Action: Direct rider to junction, notify "Be ready, bus arrives in 5 min"
```

### 3.3 Dynamic Rendezvous Points (ML-Optimized)

The system doesn't rely solely on pre-defined stops. It continuously computes optimal meeting points along the entire route:

```
Customer route: A → B → C → D → E (polyline with 200+ points)
Rider origin: Restaurant at point R

Algorithm:
1. Sample candidate points every 500m along customer route
2. For each point P:
   a. Compute customer ETA(P) using live GPS + TRAFFIC_AWARE_OPTIMAL
   b. Compute rider ETA(R→P) using live traffic from restaurant
   c. Calculate alignment_score = 1 / (|customer_eta - rider_eta| + 1)
   d. Calculate safety_score = f(accessibility, lighting, crowd, legality)
   e. Final score = α·alignment + β·safety + γ·restaurant_proximity
3. Return top-3 points with scores + timing details
```

**Key insight**: The best intercept might not be a named stop. It could be a safe roadside pull-over point where a car can stop for 60 seconds, or a known bus pause point before a highway merge.

---

## 4. Rendezvous ML Algorithm (Google Maps Routes API)

RouteBite uses **Google Maps Routes API v2** with `TRAFFIC_AWARE_OPTIMAL` — the most sophisticated routing option that uses live traffic data, historical traffic patterns, and machine learning to predict future travel times.

### 4.1 API Configuration

```json
{
  "origin": { "location": { "latLng": { "latitude": 12.97, "longitude": 77.59 } } },
  "destination": { "location": { "latLng": { "latitude": 12.30, "longitude": 76.64 } } },
  "intermediates": [
    { "location": { "latLng": { "latitude": 12.65, "longitude": 77.20 } }, "via": true }
  ],
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
  "departureTime": "2026-05-09T12:00:00Z",
  "computeAlternativeRoutes": true,
  "polylineQuality": "HIGH_QUALITY",
  "languageCode": "en-IN",
  "units": "METRIC"
}
```

### 4.2 Two-Trajectory Optimization

The core innovation: **compute both trajectories simultaneously** and find the optimal intersection.

```typescript
interface Trajectory {
  entityId: string;           // "customer_bus_123" or "rider_bike_456"
  currentLocation: LatLng;
  destination?: LatLng;        // null for roaming riders
  routePolyline: EncodedPolyline;
  speedProfile: SpeedSample[]; // Historical/ML speed predictions
  mode: 'BUS' | 'TRAIN' | 'CAR' | 'TWO_WHEELER' | 'WALK';
}

interface RendezvousCandidate {
  point: LatLng;
  customerETA: number;         // seconds from now
  riderETA: number;            // seconds from now
  waitTime: number;            // |customerETA - riderETA|
  interceptQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  safetyRating: number;        // 0-10
  restaurantDistance: number;  // meters from restaurant
  instructions: string;        // "Wait at Shell petrol pump. Bus arrives in 8 min."
}

function computeRendezvous(
  customer: Trajectory,
  rider: Trajectory,
  restaurants: Restaurant[],
  constraints: RendezvousConstraints
): RendezvousCandidate[] {
  // 1. Get customer route from Google Routes API
  const customerRoute = await routesAPI.computeRoutes({
    origin: customer.currentLocation,
    destination: customer.destination,
    travelMode: mapMode(customer.mode),
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    departureTime: new Date(),
    polylineQuality: 'HIGH_QUALITY'
  });

  // 2. For each restaurant, compute rider trajectories
  const candidates: RendezvousCandidate[] = [];
  
  for (const restaurant of restaurants) {
    // Sample points every 500m along customer route
    const samplePoints = decodePolyline(customerRoute.polyline)
      .filter((_, i) => i % 10 === 0); // Every 10th point ~500m
    
    for (const point of samplePoints) {
      // Compute customer ETA to this point
      const customerETA = await predictETA(customer, point, customerRoute);
      
      // Compute rider ETA from restaurant to this point
      const riderRoute = await routesAPI.computeRoutes({
        origin: { latLng: restaurant.location },
        destination: { latLng: point },
        travelMode: 'TWO_WHEELER', // Riders use bikes
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        departureTime: new Date(Date.now() + (customerETA.prepTime * 1000))
      });
      const riderETA = riderRoute.duration;
      
      // Score this candidate
      const waitTime = Math.abs(customerETA - riderETA);
      const quality = scoreRendezvous(waitTime, point, restaurant);
      
      if (quality.score > constraints.minScore) {
        candidates.push({
          point,
          customerETA,
          riderETA,
          waitTime,
          interceptQuality: quality.quality,
          safetyRating: quality.safety,
          restaurantDistance: riderRoute.distanceMeters,
          instructions: generateInstructions(point, customerETA, riderETA)
        });
      }
    }
  }
  
  // 3. Return top-3 candidates sorted by score
  return candidates.sort((a, b) => b.safetyRating - a.safetyRating).slice(0, 3);
}
```

### 4.3 Mode-Specific Routing Rules

| Transport Mode | Google Maps Mode | Traffic Awareness | Notes |
|---------------|------------------|-------------------|-------|
| Car / Cab | `DRIVE` | `TRAFFIC_AWARE_OPTIMAL` | Full ML optimization |
| Bike / Auto-rickshaw | `TWO_WHEELER` | `TRAFFIC_AWARE_OPTIMAL` | Critical for rider routing |
| Bus (intercity) | `DRIVE` | `TRAFFIC_AWARE_OPTIMAL` | Treat as car with stops |
| Train | Custom | Schedule-based | Use Indian Railways schedule + live status |
| Walk / Metro | `WALK` / `TRANSIT` | No traffic ML | Fixed schedule for metro |

---

## 5. Vehicle Details & Live Tracking

### 5.1 Vehicle Information (User Provides)

| Field | Required? | Used By |
|-------|-----------|---------|
| Transport mode | Yes | Route calculation, intercept type selection |
| Vehicle number / plate | Recommended | Rider identifies vehicle visually at intercept |
| Vehicle description | Yes | "VRL Volvo, red, AC sleeper" — for rider to spot |
| Route / bus number | For buses | Helps identify which traffic lights the bus will hit |
| Coach + berth / seat | For trains | Exact boarding point on platform |
| PNR (optional) | For trains | Can fetch live running status from IRCTC |
| Phone | Yes | Already in Swiggy; rider calls for coordination |

### 5.2 Live GPS & Tracking

**Two-way tracking** — the rider needs to see where the customer's vehicle is, and vice versa.

```
Customer App                    Rider (Swiggy driver app)
     │                                  │
     │ Every 15s: GPS lat/lng           │ Every 15s: GPS lat/lng
     │──────────► Backend ◄─────────────│
     │                                  │
     │  ◄────── Shared location ──────► │
     │  "Rider is 2 km away, arriving   │  "Customer bus at km 142,
     │   at traffic light in 5 min"     │   coming in 8 min"
```

**GPS sharing rules**:
- Frequency: 15-30 seconds while active order exists
- Accuracy: ~50m sufficient (rider just needs direction, not cm precision)
- Session-scoped: Data deleted after handoff complete
- Battery-optimized: Uses Google Fused Location Provider
- Fallback: If GPS unavailable, use predicted position from route + schedule

### 5.3 Rider-Facing Information

Swiggy's delivery rider app shows the delivery address. For RouteBite orders, the address includes:

```
Delivery Address: "Neemrana Highway Stop, NH-8, Rajasthan"
Landmark: "Near Neemrana Fort Palace, Delhi-Jaipur Highway"
Special Instructions: "🚗 ROUTEBITE INTERCEPT ORDER
Vehicle: Red Volvo Bus VRL-7845
Route: Delhi→Jaipur
Expected arrival: 2:45 PM (±10 min)
Bus stops here for 20 min
Call customer: +91-XXXXX
If bus leaves early, call immediately."
```

The rider can also see:
- Customer's live location on a map
- Customer's ETA to intercept point (updates every 30s)
- "You're 5 min early / 3 min late" alignment indicator
- Direct call button

---

## 6. Order Timing Engine

### 6.1 Timed Order Placement

```
order_placement_time = intercept_time - food_prep_time - rider_travel_time - safety_buffer - buffer_for_traffic

Where:
- intercept_time: predicted customer arrival at rendezvous (from ML routing)
- food_prep_time: Swiggy restaurant average (from search_restaurants response)
- rider_travel_time: Google Routes ETA from restaurant to intercept
- safety_buffer: 10-15 min for unexpected delays
- traffic_buffer: extra 5-10 min if TRAFFIC_AWARE_OPTIMAL shows congestion

Example:
├─ Customer ETA to Neemrana: 2:45 PM
├─ Food prep time: 25 min
├─ Rider travel: 15 min
├─ Safety buffer: 15 min
├─ Traffic buffer: 5 min
└─ Auto-place order at: 1:45 PM
```

### 6.2 Order Alignment Dashboard

Live view showing timing alignment:

```
📍 Neemrana Highway Stop

🚗 You (bus VRL-7845)
   Arriving in: 28 min
   Current: km 142/260
   
🏍️ Rider (Rahul, bike KA-03-9912)
   Arriving in: 24 min
   Current: Picking up your biryani
   
⚡ Alignment: GOOD (4 min buffer)
   
⏱️ Order status: Preparing
   Biryani will be ready in 18 min
   
📞 Call rider
```

---

## 7. Core User Flows

### Flow 1: Complete Intercept Journey (Food + Instamart)

```
[Home Screen — Dark map, "Where are you going?"]
    ↓
[Enter Journey Details]
    ├─ Origin (GPS auto-detect or type)
    ├─ Destination (type)
    ├─ Transport mode (Bus / Train / Car / Bike)
    ├─ Vehicle number / plate (e.g., "VRL-7845")
    ├─ Vehicle description (e.g., "Red Volvo AC Sleeper")
    ├─ Coach/Seat (if train)
    └─ Phone (pre-filled from Swiggy)
    ↓
[Route Analysis — ML Processing]
    ├─ Google Routes API: TRAFFIC_AWARE_OPTIMAL route compute
    ├─ Identify intercept candidates:
    │   ├─ Scheduled stops (bus rest areas, stations)
    │   ├─ Traffic lights (for urban routes)
    │   ├─ Petrol pumps, toll plazas
    │   └─ Dynamic safe pull-over points
    ├─ Score each candidate
    └─ Display: "3 Food opportunities, 2 Instamart opportunities"
    ↓
[Interactive Route Map]
    ├─ Dark themed (#0A0A0F background)
    ├─ Route line with gradient based on timing
    ├─ Numbered intercept pins (color-coded by quality)
    ├─ Tap pin → stop detail
    └─ Bottom sheet: "Food available here" | "Instamart available here"
    ↓
[Stop Detail — Split View Food | Instamart]
    ├─ Stop name, ETA window, dwell time estimate
    ├─ 📋 FOOD tab:
    │   ├─ Restaurant list from Swiggy search_restaurants
    │   ├─ Filters: veg / non-veg / rating / cuisine
    │   ├─ Menu with real-time availability
    │   ├─ Add to cart (single restaurant constraint)
    │   └─ ₹1000 cap warning
    ├─ 🛒 INSTAMART tab:
    │   ├─ Product search from Swiggy search_products
    │   ├─ Categories: Water, Snacks, Essentials, Medicines
    │   ├─ Product variants (size, flavor)
    │   ├─ Add to cart (multi-product)
    │   └─ ₹99 minimum warning
    └─ Both carts maintained independently
    ↓
[Cart Review — Per Server]
    ├─ Items + bill breakdown
    ├─ Apply coupon (fetch_food_coupons)
    ├─ Delivery address = intercept point (lat/lng + geocoded address)
    ├─ Order timing options:
    │   ├─ Place now (if within safe window)
    │   ├─ Auto-place at [calculated time]
    │   └─ Manual: "Place 30 min before I arrive"
    ├─ Order notes: auto-generated from vehicle details
    └─ Non-idempotent guard: check-then-retry on place_order
    ↓
[Order Placed — Alignment Dashboard]
    ├─ Order ID(s)
    ├─ Countdown to intercept
    ├─ Live alignment: Customer ETA vs Rider ETA
    ├─ Map: both positions updating in real time
    └─ "Rider 4 min ahead of schedule" indicators
    ↓
[Rider Handoff]
    ├─ Notification: "Rider Rahul is at the stop. Look for bike KA-03-9912"
    ├─ Call rider button
    ├─ Share live location (one-tap)
    └─ "Handoff complete" → rate order
```

### Flow 2: Traffic Light Intercept (Urban Bus)

```
[User on Bangalore city bus #201]
    ↓
[App detects: urban route, frequent stops]
    ├─ "Traffic light intercepts available (7 upcoming)"
    └─ Shows upcoming traffic lights on route
    ↓
[Select traffic light: "4th Cross Junction"]
    ├─ Bus ETA: 6 min
    ├─ Predicted red light duration: 45-90 sec
    ├─ Nearby restaurants: 3 (within 2 km)
    ├─ Rider on two-wheeler can reach in 5 min
    └─ Intercept score: GOOD
    ↓
[Select quick item: "Masala Dosa + Coffee"]
    ├─ Prep time: 8 min
    ├─ Order placed immediately (small window)
    ├─ Rider rushes to traffic light
    ↓
[At traffic light]
    ├─ Notification: "Your dosa is here! Look for bike near signal."
    ├─ Bus stops at red light
    ├─ Rider hands order through window / at door
    └─ Handoff in 30 seconds ✅
```

### Flow 3: Combined Session

```
Stop: Neemrana Highway (km 142)

Order 1 — Food:
├─ Restaurant: Highway King
├─ Items: Paneer Tikka, Naan, Dal Makhani
├─ Cart total: ₹485
├─ Timing: Auto-place at 1:30 PM
├─ Status: Confirmed

Order 2 — Instamart:
├─ Store: Swiggy Instamart (Alwar dark store)
├─ Items: 2× Water (1L), Phone charger, Pain relief spray
├─ Cart total: ₹347
├─ Timing: Auto-place at 2:00 PM
├─ Status: Confirmed

Unified view: Both arriving at Neemrana. Pick up together.
```

---

## 8. Technical Architecture

```
┌──────────────────────────────────────────────┐
│          RouteBite PWA (React 19)            │
│  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Route Input │  │ Interactive Map         │ │
│  │   Screen    │  │ (Google Maps JS API)    │ │
│  └─────────────┘  │ Dark theme, live pins   │ │
│                   │ Route line, intercepts  │ │
│  ┌─────────────┐  └─────────────────────────┘ │
│  │ Server Tabs │  ┌─────────────────────────┐ │
│  │ Food|Insta  │  │ Live Alignment Dashboard│ │
│  └─────────────┘  │ ETA comparison, calls   │ │
│                   └─────────────────────────┘ │
└──────────────────────┬───────────────────────┘
                       │ HTTPS / SSE
                       ▼
┌──────────────────────────────────────────────────┐
│           RouteBite API (Hono + Bun)             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ Session     │  │ Rendezvous  │  │ Swiggy   │ │
│  │ Manager     │  │ Engine (ML) │  │ MCP Proxy│ │
│  │ (OAuth)     │  │             │  │          │ │
│  └─────────────┘  └──────┬──────┘  └─────┬────┘ │
│                          │               │       │
└──────────────────────────┼─────┬─────────┼───────┘
                           │     │         │
            ┌──────────────┘     │         └──────────────┐
            ▼                    ▼                        ▼
┌──────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Google Maps APIs │  │   SQLite (Turso)   │  │  Swiggy MCP        │
│                  │  │                    │  │  (Mock → Live)     │
│ Routes API v2    │  │ sessions           │  │  Food Server       │
│ ├─ computeRoutes │  │ routes             │  │  Instamart Server  │
│ ├─ TRAFFIC_AWARE │  │ active_orders      │  │  OAuth Server      │
│ ├─ decodePolyline│  │ intercept_points   │  │                    │
│ Places API       │  │ vehicle_tracking   │  │  localhost:8788    │
│ Geocoding API    │  │                    │  │  → mcp.swiggy.com  │
└──────────────────┘  └────────────────────┘  └────────────────────┘
```

---

## 9. Database Schema

```sql
-- sessions: OAuth sessions (minimal PII)
sessions (
  id            TEXT PRIMARY KEY,     -- uuid
  swiggy_hash   TEXT NOT NULL,        -- SHA256(swiggy_user_id)
  access_token  TEXT,                 -- encrypted
  token_expires INTEGER,              -- Unix ms
  scope         TEXT,                 -- "food instamart"
  created_at    INTEGER DEFAULT (unixepoch() * 1000)
);

-- routes: user journey definitions
routes (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  origin_lat      REAL,
  origin_lng      REAL,
  dest_lat        REAL,
  dest_lng        REAL,
  transport_mode  TEXT NOT NULL,      -- BUS | TRAIN | CAR | BIKE
  vehicle_plate   TEXT,
  vehicle_desc    TEXT NOT NULL,
  vehicle_type    TEXT,               -- VOLVO | SLEEPER | HATCHBACK | etc
  coach_seat      TEXT,               -- for trains
  route_polyline  TEXT,               -- Google encoded polyline
  total_distance  INTEGER,            -- meters
  total_duration  INTEGER,            -- seconds (ML predicted)
  created_at      INTEGER DEFAULT (unixepoch() * 1000)
);

-- intercepts: candidate meeting points (computed by ML engine)
intercepts (
  id              TEXT PRIMARY KEY,
  route_id        TEXT NOT NULL REFERENCES routes(id),
  type            TEXT NOT NULL,      -- SCHEDULED_STOP | TRAFFIC_LIGHT | PETROL_PUMP | TOLL_PLAZA | DYNAMIC
  name            TEXT,
  address         TEXT,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  eta_from_start  INTEGER,            -- seconds from route start
  dwell_estimate  INTEGER,            -- estimated seconds vehicle stops here
  safety_score    REAL,               -- 0-10
  food_available  BOOLEAN DEFAULT false,
  instamart_available BOOLEAN DEFAULT false,
  ml_score        REAL,               -- rendezvous quality score
  created_at      INTEGER DEFAULT (unixepoch() * 1000)
);

-- active_orders: Swiggy orders in flight
active_orders (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  swiggy_order_id TEXT,
  server          TEXT NOT NULL,      -- "food" | "instamart"
  restaurant_id   TEXT,
  entity_name     TEXT,               -- restaurant or store name
  intercept_id    TEXT REFERENCES intercepts(id),
  intercept_name  TEXT,
  intercept_lat   REAL,
  intercept_lng   REAL,
  customer_eta    INTEGER,            -- predicted arrival at intercept
  rider_eta       INTEGER,            -- predicted rider arrival
  order_placed_at INTEGER,
  auto_place_time INTEGER,            -- if timed order
  status          TEXT DEFAULT "placed", -- placed | preparing | ready | intercepting | handoff_complete | cancelled
  total_paise     INTEGER,
  payment_method  TEXT DEFAULT "cod",
  created_at      INTEGER DEFAULT (unixepoch() * 1000)
);

-- tracking: live GPS traces (TTL: 24h, aggressively purged)
tracking (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type     TEXT NOT NULL,      -- "customer" | "rider"
  entity_id       TEXT NOT NULL,      -- session_id or swiggy rider id
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  accuracy        REAL,
  speed           REAL,
  recorded_at     INTEGER DEFAULT (unixepoch() * 1000)
);

-- Create index for TTL cleanup
CREATE INDEX idx_tracking_time ON tracking(recorded_at);
```

---

## 10. OAuth 2.1 + Token Lifecycle

See `spec.md` §7 from previous version (unchanged) — PKCE with S256, 5-day tokens, no refresh in v1.0, 401/419 handling.

---

## 11. Error Resilience (Production-Grade)

See `spec.md` §8 from previous version, with additions:

| New Error Class | Handling |
|----------------|----------|
| Intercept point closed | Re-run rendezvous algorithm with next candidate |
| Customer deviated from route | Recalculate intercepts; notify rider of updated ETA |
| Rider stuck in traffic | Extend safety buffer; notify customer of delay |
| Traffic light turns green early | Rider waits at next light; notify customer |
| Bus skip unscheduled stop | Fall back to next intercept point; auto-adjust order timing |
| Food + Instamart misaligned | Track independently; show separate ETAs |

---

## 12. Mock ↔ Live Swap

See `spec.md` §9 from previous version — `MOCK_SWIGGY` env var controls all endpoints.

The mock must replicate:
- `/.well-known/oauth-authorization-server`
- `/auth/authorize` + OTP simulation
- `/auth/token` + 5-day expiry
- `/food/*` — all tools
- `/instamart/*` — all tools
- `hasWidgets: true` in capability response (future-proof)

---

## 13. Development Phases (AIDLC Aligned)

| Phase | Deliverable | Time |
|-------|-------------|------|
| **Inception** | PRD + Spec + User Stories + App Design | 1-2 days |
| **Unit 1** | Mock Swiggy MCP (Food + Instamart + OAuth) | 2 days |
| **Unit 2** | Google Maps route engine + Rendezvous ML | 2 days |
| **Unit 3** | Frontend PWA (route input, map, server tabs, cart) | 3 days |
| **Unit 4** | Order placement + live tracking + intercept UX | 2 days |
| **B&T** | Integration tests, e2e demo flow, Loom video | 2 days |
| **Submit** | Apply to Swiggy /access with demo | — |

---

## 14. Swiggy Submission Strategy

### What Makes This Different From Every Other Builder

1. **Moving-target delivery** — not "order to a hotel room", but "catch me on the highway"
2. **ML-optimized rendezvous** — Google Maps TRAFFIC_AWARE_OPTIMAL routing both trajectories
3. **Traffic light intercepts** — 30-60 second urban handoffs, not just highway stops
4. **True multi-server** — Food + Instamart as equals, not afterthought
5. **Rider-tracking-customer** — delivery person can see where the bus/train is
6. **Production resilience** — every guard, every retry, every edge case handled
7. **Privacy-first** — no PII persistence, session-scoped GPS, hashed IDs

### Demo Video Outline (4-5 min Loom)

```
0:00 — Hook: "23 million Indians travel by bus and train every day. 
        They eat terrible food. Here's how we fix it."
0:30 — Enter journey: Delhi → Jaipur, Bus VRL-7845
1:00 — Route analysis: ML finds intercept points
1:30 — Select Neemrana stop → Food tab → add biryani + Instamart tab → add water
2:00 — Order timing: "Auto-place at 1:45 PM so food arrives at 2:45 PM"
2:30 — Live dashboard: bus at km 142, rider picking up, alignment GOOD
3:00 — Rider view: sees bus location, ETA, calls customer
3:30 — Handoff at stop: "Your biryani and water are here!"
4:00 — Traffic light intercept demo (Bangalore urban)
4:30 — Architecture teaser: "Built on Swiggy MCP + Google Maps ML + Hono"
4:50 — CTA: "Want to see more? github.com/aaryanguglani/routebite"
```

---

*Spec version 2.0 — 2026-05-08*
*Incorporates: traffic light intercepts, ML rendezvous algorithm, dual-server parity, rider-customer tracking*
