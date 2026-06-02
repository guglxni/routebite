# Google Maps Platform Enhancements — RouteBite

**Status:** Planned  
**Last updated:** 2026-06-01  
**Scope:** Integrate modern Google Maps Platform APIs to improve intercept scoring, restaurant discovery, journey–delivery alignment, and map UX.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background & Motivation](#background--motivation)
3. [Current State in RouteBite](#current-state-in-routebite)
4. [Google Promo Features (Maps Demo Key)](#google-promo-features-maps-demo-key)
5. [Enhancement Catalog](#enhancement-catalog)
6. [Integration Roadmap](#integration-roadmap)
7. [Architecture Impact](#architecture-impact)
8. [API Reference Quick Sheet](#api-reference-quick-sheet)
9. [Billing & Cost Controls](#billing--cost-controls)
10. [Environment & Configuration](#environment--configuration)
11. [Testing Strategy](#testing-strategy)
12. [Risks & Constraints](#risks--constraints)
13. [Success Metrics](#success-metrics)
14. [References](#references)

---

## Executive Summary

RouteBite plans to deepen its Google Maps Platform integration across four layers:

| Layer | Goal | Key APIs |
|-------|------|----------|
| **Algorithm accuracy** | Replace placeholders with real geospatial data | Places Aggregate, Routes `extraComputations`, Weather |
| **Discovery** | Find restaurants/products along the journey route | Text Search along route, Routing Summaries |
| **Map UX** | Visual journey planning and intercept preview | Cloud styling, Places UI Kit, Photorealistic 3D Maps |
| **Live alignment** | Sync customer arrival with rider delivery | Browser GPS + Routes recompute, Weather alerts |

These enhancements directly support RouteBite's core value proposition: **order food and essentials at intercept points along your route, timed so rider and customer arrive together.**

---

## Background & Motivation

### Product context

RouteBite orchestrates:

1. **Journey planning** — origin → destination with transport mode (car, bike, bus, train, metro, walk)
2. **Intercept detection** — scored stop points (traffic lights, transit stops, tolls, dynamic pull-overs)
3. **Swiggy ordering** — Food or Instamart at intercept coordinates
4. **Alignment tracking** — compare customer ETA vs. rider ETA and score sync quality

Maps data is foundational to steps 1, 2, and 4. Today several subsystems use **heuristic placeholders** where Google provides authoritative APIs.

### Trigger

Google Maps Platform promoted four areas via their **Maps Demo Key** campaign:

- Dynamic Maps + cloud-based maps styling
- Photorealistic 3D Maps
- Places UI Kit (Place Search, Autocomplete, Place Details — GA)
- Weather API (forecasts + public alerts)

Research confirmed additional high-value APIs not in the promo but critical for RouteBite: Places Aggregate, search along route, Routes waypoint optimization, traffic polylines, and India-specific road metadata (flyovers, narrow roads).

---

## Current State in RouteBite

### Already integrated

Location: `apps/api/src/services/maps/`

| API | Endpoint / method | Used for |
|-----|-------------------|----------|
| Routes API v2 | `computeRoutes` | Journey polyline, steps, transit stop details |
| Route Matrix API | `computeRouteMatrix` | Rider travel time for order timing, restaurant ranking |
| Geocoding API | `geocode` / `reverseGeocode` | Address validation, intercept delivery addresses |
| Roads API | `snapToRoads` | Snap intercept points to drivable geometry |
| Roads API | `getSpeedLimits` | Available but underutilized |
| Address Validation API | `validateAddress` | Origin/destination typo catching on route analyze |

Supporting infrastructure:

- `SimpleLRUCache` — route, geocode, matrix, roads, address validation caches (`apps/api/src/services/maps/cache.ts`)
- Transport mode mapping with `TRAFFIC_AWARE_OPTIMAL` for car/bike (`apps/api/src/services/maps/constants.ts`)

### Known gaps (placeholders / missing)

| Gap | Current behavior | File |
|-----|------------------|------|
| Restaurant density at intercept | Deterministic hash of lat/lng (1–15 fake count) | `apps/api/src/services/intercept/algorithm.ts` → `estimateRestaurantCount()` |
| Traffic on route polyline | Types defined (`TravelAdvisory`) but not requested | `apps/api/src/services/maps/types.ts`, `client.ts` |
| Toll detection | Parsed from navigation instruction strings | `apps/api/src/services/intercept/algorithm.ts` |
| Customer live ETA | Not implemented; poller uses Swiggy-reported ETAs only | `apps/api/src/services/tracking/poller.ts` |
| Route optimization | Custom brute-force / greedy TSP (~200 lines) | `apps/api/src/services/route-optimization/index.ts` |
| Map visualization | No map in web app; demo place list in RouteBuilder | `apps/web/src/pages/RouteBuilder.tsx` |
| Weather / environmental factors | Not considered in intercept safety scoring | — |

---

## Google Promo Features (Maps Demo Key)

**Demo key URL:** https://goo.gle/4bXxQzG  
**Purpose:** Explore Dynamic Maps, 3D Maps, Places UI Kit, and Weather without a credit card during prototyping.

| Promo feature | Description | RouteBite application |
|---------------|-------------|---------------------|
| **Dynamic Maps + cloud styling** | Map appearance controlled from Google Cloud Console via Map IDs; updates propagate without redeploy | Branded dark-theme journey maps matching PWA (`#0A0A0F`, amber accent) |
| **Photorealistic 3D Maps** | High-res 3D tiles in 50 countries; custom HTML markers; programmable camera | Fly-along route preview; "see your intercept stop" before ordering |
| **Places UI Kit** | Low-code Place Search, Autocomplete, Place Details on any map | Replace RouteBuilder demo places; rich restaurant cards at intercepts |
| **Weather API** | Hourly (240h), daily (10d) forecasts; public alerts from national authorities | Intercept safety scoring; timing buffers; user warnings on TrackOrder |

---

## Enhancement Catalog

Enhancements are grouped by priority tier. Each entry includes problem, proposed API, integration point, and acceptance criteria.

---

### Tier 1 — Backend Accuracy (Highest Impact)

These fix core algorithm placeholders and improve alignment without requiring frontend map work.

---

#### E1. Places Aggregate API — Real Restaurant Density

**Priority:** P0  
**Effort:** Medium  
**SKU:** Places Aggregate API

**Problem:** Intercept scoring weights restaurant density at 25/100 points, but `estimateRestaurantCount()` returns a fake hash-based value.

**Solution:** Call Places Aggregate API with `INSIGHT_COUNT` for a 500m circle around each candidate intercept.

**Request shape:**

```json
{
  "insightType": "INSIGHT_COUNT",
  "locationFilter": {
    "circle": {
      "center": { "latitude": 12.9352, "longitude": 77.6245 },
      "radius": 500.0
    }
  },
  "typeFilter": { "includedTypes": ["restaurant"] },
  "operatingStatus": { "includedStatuses": ["OPERATING_STATUS_OPERATIONAL"] }
}
```

**Integration points:**

- `apps/api/src/services/intercept/algorithm.ts` — replace `estimateRestaurantCount()`
- `apps/api/src/services/maps/client.ts` — new `getRestaurantCount(lat, lng, radiusM)` method
- `apps/api/src/services/maps/cache.ts` — cache with ~1h TTL (counts change slowly)

**Optional filters for future:**

- Price level (`PRICE_LEVEL_MODERATE`, etc.)
- Minimum rating (`ratingFilter`)
- Custom polygon along route segment instead of circle

**Acceptance criteria:**

- [ ] Intercept scores reflect real operational restaurant counts within 500m
- [ ] Cache prevents duplicate Aggregate calls for nearby candidates
- [ ] Graceful fallback to heuristic if API fails or quota exceeded

**Docs:** https://developers.google.com/maps/documentation/places-aggregate/overview

---

#### E2. Routes API `extraComputations` — Traffic, Tolls, India Road Metadata

**Priority:** P0  
**Effort:** Medium  
**SKU:** Routes Preferred (for `TRAFFIC_ON_POLYLINE`); standard Routes for tolls

**Problem:** Route analysis ignores traffic segments, reliable toll data, and India-specific road characteristics. Toll detection relies on parsing navigation instruction strings.

**Solution:** Enable explicit `extraComputations` on `computeRoutes` (required since Routes API GA — no longer implicit).

| Computation | Response field | RouteBite use |
|-------------|----------------|---------------|
| `TRAFFIC_ON_POLYLINE` | `routes.travelAdvisory.speedReadingIntervals` | Boost intercept dwell at `TRAFFIC_JAM` / `SLOW` segments |
| `TOLLS` | `routes.travelAdvisory.tollInfo` | Reliable toll plaza intercept candidates |
| `FUEL_CONSUMPTION` | `routes.travelAdvisory.fuelConsumptionMicroliters` | Optional journey metadata for car mode |
| `FLYOVER_INFO_ON_POLYLINE` | `routes.polylineDetails.flyoverInfo` | India metros (experimental) — prefer pull-over off flyovers |
| `NARROW_ROAD_INFO_ON_POLYLINE` | `routes.polylineDetails.narrowRoadInfo` | India metros (experimental) — penalize bike delivery on narrow roads |

**Request augmentation:**

```json
{
  "departureTime": "2026-06-01T08:30:00Z",
  "extraComputations": [
    "TRAFFIC_ON_POLYLINE",
    "TOLLS",
    "NARROW_ROAD_INFO_ON_POLYLINE"
  ],
  "routingPreference": "TRAFFIC_AWARE_OPTIMAL"
}
```

**Field mask additions:**

```
routes.travelAdvisory.speedReadingIntervals,
routes.travelAdvisory.tollInfo,
routes.polylineDetails.narrowRoadInfo,
routes.polylineDetails.flyoverInfo
```

**Integration points:**

- `apps/api/src/services/maps/constants.ts` — extend `ROUTES_FIELD_MASK`
- `apps/api/src/services/maps/client.ts` — pass `extraComputations`, accept `departureTime` opt
- `apps/api/src/services/intercept/algorithm.ts` — use traffic intervals to adjust dwell time; use toll API data instead of string matching
- `apps/api/src/services/intercept/scoring.ts` — narrow-road penalty on safety score

**Acceptance criteria:**

- [ ] Route responses include traffic speed intervals for car/bike modes
- [ ] Toll intercepts sourced from API where available
- [ ] Intercept scoring adjusts for traffic density on approach segment
- [ ] India narrow-road penalty applied when data present (no error when absent)

**Docs:**

- https://developers.google.com/maps/documentation/routes/traffic_on_polylines
- https://developers.google.com/maps/documentation/routes/migrate-routes-preview

---

#### E3. Departure-Time Routing — Time-of-Day Aware ETAs

**Priority:** P0  
**Effort:** Low  
**SKU:** Routes (traffic-aware tiers)

**Problem:** Intercept customer ETAs use static speed estimates (`estimateSpeed()`). Alignment and auto-place timing don't account for rush hour.

**Solution:** Pass `departureTime` (RFC3339 UTC) on route analyze and recompute calls. Combine with `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL`.

**Integration points:**

- `apps/api/src/routes/routes.ts` — accept optional `departureTime` in analyze body; default to `now`
- `apps/api/src/services/intercept/algorithm.ts` — use route duration from API instead of haversine/speed heuristic where possible
- `apps/api/src/services/order/timing.ts` — pass departure time aligned with expected intercept arrival

**Acceptance criteria:**

- [ ] Journey analyze accepts `departureTime` and returns traffic-adjusted duration
- [ ] Intercept `customerETA` reflects time-of-day traffic
- [ ] Auto-place timestamp uses traffic-aware intercept ETA

**Docs:** https://developers.google.com/maps/documentation/routes/compute-route-over

---

#### E4. Weather API — Intercept Safety & Timing Buffers

**Priority:** P1  
**Effort:** Medium  
**SKU:** Weather API

**Problem:** Safety rating at intercepts uses static defaults (3.0–4.0). No weather-aware warnings for outdoor stops (traffic lights, bus stops).

**Solution:** Integrate Weather API at journey analyze and track time.

| Endpoint | Use in RouteBite |
|----------|------------------|
| `forecast/hours:lookup` | Precipitation probability at expected intercept arrival hour |
| `forecast/days:lookup` | Journey-day overview on RouteBuilder confirmation |
| `publicAlerts:lookup` | Block or warn on cyclone, flood, heat, wind alerts intersecting route |
| Current conditions | Real-time re-rank during active journey |

**Example alert lookup:**

```
GET https://weather.googleapis.com/v1/publicAlerts:lookup
  ?key=API_KEY
  &location.latitude=12.97
  &location.longitude=77.59
  &languageCode=en-IN
```

**Integration points:**

- New `apps/api/src/services/weather/` module (client + types)
- `apps/api/src/services/intercept/scoring.ts` — weather penalty on `safetyRating` component
- `apps/api/src/services/order/timing.ts` — add weather buffer to `TRAFFIC_BUFFER_S` when rain/thunderstorm likely
- `apps/api/src/routes/routes.ts` — return weather warnings array on analyze response
- `apps/web/src/pages/TrackOrder.tsx` — display alert banner when active

**Scoring proposal:**

| Condition | Safety adjustment |
|-----------|-------------------|
| Precipitation probability > 70% at intercept hour | −0.5 safety stars |
| Visibility < 2 km | −0.3 safety stars |
| Active severe public alert in area | Flag intercept as `weather_risk`; optional exclude |

**Acceptance criteria:**

- [ ] Weather fetched for each ranked intercept at expected arrival time
- [ ] Public alerts surfaced on journey analyze when route intersects affected area
- [ ] Order timing adds configurable buffer under adverse conditions
- [ ] Cache hourly forecasts per lat/lng grid cell (~1h TTL)

**Docs:** https://developers.google.com/maps/documentation/weather/overview

---

### Tier 2 — Discovery & Route Intelligence

---

#### E5. Text Search Along Route + Routing Summaries

**Priority:** P1  
**Effort:** Medium  
**SKU:** Places API (New) — Text Search

**Problem:** Restaurant discovery is Swiggy-only. Intercept pre-validation doesn't know if *any* food POIs exist along the route outside Swiggy coverage.

**Solution:** Pass journey encoded polyline to Places Text Search (New) with `searchAlongRouteParameters`.

**Request shape:**

```json
{
  "textQuery": "restaurant",
  "searchAlongRouteParameters": {
    "polyline": { "encodedPolyline": "ROUTE_POLYLINE_FROM_JOURNEY" }
  }
}
```

**Routing summaries** (add to field mask: `routingSummaries`):

- Travel duration/distance from route origin to each place
- Travel from each place to route destination
- Enables ranking restaurants by total journey deviation cost

**Integration points:**

- `apps/api/src/services/maps/client.ts` — `searchAlongRoute(textQuery, encodedPolyline, opts)`
- New endpoint or extend `GET /api/v1/intercepts/:id/restaurants` — merge Google POI data with Swiggy results
- `apps/api/src/services/order/timing.ts` — `rankRestaurantsByTravelTime()` enhanced with routing summaries

**Use cases:**

1. Pre-validate intercept: skip points with zero Google + zero Swiggy coverage
2. "Search remaining route" — override polyline origin to current position mid-journey
3. Rank intercept restaurants by rider feasibility (deviation minutes)

**Acceptance criteria:**

- [ ] Text search along route returns places near journey polyline
- [ ] Routing summaries available for top N restaurants per intercept
- [ ] API response merges Swiggy availability with Google POI presence flag

**Docs:**

- https://developers.google.com/maps/documentation/places/web-service/search-along-route
- https://developers.google.com/maps/documentation/places/web-service/routing-summary-sar

---

#### E6. Native Waypoint Optimization (`optimizeWaypointOrder`)

**Priority:** P2  
**Effort:** Low–Medium  
**SKU:** Routes Compute Routes **Pro**

**Problem:** Custom `bruteForceOptimize()` / `greedyOptimize()` in `route-optimization/` duplicates Google-maintained TSP solver.

**Solution:** Use Routes API native optimization:

```json
{
  "intermediates": [/* intercept or pickup waypoints */],
  "optimizeWaypointOrder": true
}
```

Field mask: `routes.optimizedIntermediateWaypointIndex`

**Constraints:**

- Cannot use `via: true` waypoints
- Cannot combine with `TRAFFIC_AWARE_OPTIMAL` — use `TRAFFIC_AWARE` when optimizing
- Billed at Pro SKU rate

**Integration points:**

- Replace or wrap `apps/api/src/services/route-optimization/index.ts`
- Future endpoint: `POST /api/v1/routes/optimize` for multi-restaurant orders

**Use cases:**

- Multi-intercept food orders (pick up at 2+ restaurants, meet rider at intercept #3)
- Batch Instamart pickups along commute

**Acceptance criteria:**

- [ ] Multi-stop optimization delegated to Google for ≤25 waypoints
- [ ] Custom TSP code deprecated or kept as offline fallback only
- [ ] Optimized order persisted on journey/ order records

**Docs:** https://developers.google.com/maps/documentation/routes/opt-way

---

#### E7. Places API (New) — Granular Types & Rich Metadata

**Priority:** P2  
**Effort:** Medium  
**SKU:** Places API (New)

**Problem:** Generic "restaurant" filtering misses cuisine relevance and area context.

**New capabilities (2025–2026 release notes):**

- ~200 granular place types (`indian_restaurant`, `meal_delivery`, `tea_house`, etc.)
- Place summaries, review summaries, area summaries
- Address descriptors (nearby landmarks for delivery instructions)
- `googleMapsTypeLabel` — localized type label

**Integration points:**

- Intercept restaurant search filters by cuisine preference
- `generateInterceptAddress()` — enrich with address descriptors ("near Metro pillar 47")
- Intercepts UI — show area summary ("Known for street food")

**Acceptance criteria:**

- [ ] Nearby search supports granular type filters
- [ ] Delivery notes include landmark descriptors when available

**Docs:** https://developers.google.com/maps/documentation/places/web-service/release-notes

---

### Tier 3 — Frontend Map UX (Promo Features)

RouteBite web app currently has **no map visualization**. These enhancements add the visual product layer.

---

#### E8. Cloud-Based Maps Styling + Dynamic Maps

**Priority:** P1 (frontend)  
**Effort:** Medium  
**SKU:** Dynamic Maps

**Problem:** No map UI; brand identity not expressed geospatially.

**Solution:**

1. Create Map ID in Google Cloud Console
2. Configure cloud styling (dark mode, hide irrelevant POIs, emphasize transit/roads)
3. Load Maps JavaScript API with Map ID on RouteBuilder, Intercepts, TrackOrder

**Brand alignment:**

- Background: `#0A0A0F` (void)
- Accent: amber (intercept markers, selected route)
- Light/dark variants for system preference

**Integration points:**

- New `apps/web/src/components/JourneyMap.tsx`
- `apps/web/vite.config.ts` — ensure Maps JS API key via env (client-side key with referrer restrictions)
- Pages: `RouteBuilder.tsx`, `Intercepts.tsx`, `TrackOrder.tsx`

**Acceptance criteria:**

- [ ] Map ID configured in Cloud Console with RouteBite dark theme
- [ ] Journey polyline rendered with intercept markers
- [ ] Style updates publish without app redeploy

**Docs:** https://developers.google.com/maps/documentation/javascript/cloud-customization

---

#### E9. Places UI Kit

**Priority:** P1 (frontend)  
**Effort:** Medium  
**SKU:** Places UI Kit API (lower cost than equivalent Places API for UI flows)

**Problem:** RouteBuilder uses hardcoded Bangalore demo places. Restaurant cards are custom-built without Google ratings/photos/hours.

**Components (GA):**

| Component | Replace / enhance |
|-----------|-------------------|
| **Autocomplete** | `RouteBuilder` origin/destination inputs |
| **Place Search** | Restaurant discovery at intercept |
| **Place Details** | Intercept detail panel (hours, photos, reviews, accessibility) |

**Billing note:** Places UI Kit requests bill at Places UI Kit rate regardless of underlying search method — typically cheaper for UI-heavy flows.

**Integration points:**

- Replace `demoPlaces` array in `apps/web/src/pages/RouteBuilder.tsx`
- `apps/web/src/pages/Intercepts.tsx` — Place Details compact element per intercept
- `apps/web/src/pages/Menu.tsx` — Place Search for nearby restaurants (alongside Swiggy data)

**Customization:** Colors, typography, corner radius via Places UI Kit styling API — match RouteBite brand.

**Acceptance criteria:**

- [ ] Autocomplete returns real Indian addresses with session tokens
- [ ] Place Search renders at intercept with brand styling
- [ ] Place Details shows hours/ratings without custom Swiggy-only UI gaps

**Docs:** https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview

---

#### E10. Photorealistic 3D Maps

**Priority:** P2 (frontend)  
**Effort:** High  
**SKU:** 3D Maps (Dynamic Maps tier)

**Problem:** Users can't preview what an intercept stop looks like before ordering at a traffic light or bus stop.

**Solution:** Enable 3D Maps in Maps JavaScript API with:

- Custom HTML markers at intercept points (score, dwell time, restaurant count badge)
- Programmable camera — cinematic fly-to on intercept selection
- Toggle photorealistic ↔ abstract basemap
- Combine with Places UI Kit Place Details

**Integration points:**

- `apps/web/src/components/JourneyMap3D.tsx` — optional enhanced map mode
- `Intercepts.tsx` — "Preview stop" button triggers camera fly-to
- `Landing.tsx` — hero visual demo (marketing)

**Acceptance criteria:**

- [ ] 3D view available on Intercepts page for supported regions (India included in 50-country coverage)
- [ ] Intercept markers show score and type in HTML overlay
- [ ] Graceful 2D fallback where 3D tiles unavailable

**Docs:** https://mapsplatform.google.com/resources/blog/transform-your-maps-with-new-tools-for-immersive-3d-experiences-and-granular-place-information/

---

### Tier 4 — Live Alignment & Environmental Overlays

---

#### E11. Live Customer GPS → Dynamic Customer ETA

**Priority:** P1  
**Effort:** High  
**SKU:** Routes API (repeated computeRoutes or Routes Preferred)

**Problem:** Alignment engine compares Swiggy `customerETA` vs `riderETA`, but customer position is not tracked. Comment in poller: *"We don't have real customer GPS in this demo."*

**Solution:**

1. Browser Geolocation API — poll every 15s with user consent (align with `TRACKING.GPS_POLL_INTERVAL_MS` in shared constants)
2. Routes API — compute remaining duration from current position to intercept with `departureTime: now` and traffic-aware routing
3. Feed result into `computeAlignment()` as authoritative `customerETA`

**Integration points:**

- `apps/web/src/stores/tracking.ts` — emit GPS updates
- New `POST /api/v1/journeys/:id/position` or WebSocket for position ingest
- `apps/api/src/services/tracking/poller.ts` — merge customer GPS ETA with rider ETA
- `apps/api/src/services/tracking/alignment.ts` — no change to core formula; better inputs

**Privacy:**

- GPS stored ephemerally; purge per `DATA_RETENTION.GPS_PURGE_AFTER_H` (24h)
- Explicit consent UI on TrackOrder page

**Acceptance criteria:**

- [ ] Customer ETA derived from live position + Routes API
- [ ] Alignment score updates as customer moves
- [ ] GPS data purged after retention window

---

#### E12. Time Zone API

**Priority:** P2  
**Effort:** Low  
**SKU:** Time Zone API

**Problem:** Auto-place timestamps may drift across IST/state boundaries on long journeys.

**Solution:** Resolve timezone from intercept lat/lng for display and scheduler cron alignment.

**Integration points:**

- Order timing display in web app
- Auto-place scheduler (future background job)

**Acceptance criteria:**

- [ ] Auto-place times displayed in user's local timezone at intercept

**Docs:** https://developers.google.com/maps/documentation/timezone/overview

---

#### E13. Air Quality & Pollen APIs

**Priority:** P3  
**Effort:** Medium  
**SKU:** Air Quality API, Pollen API

**Problem:** Open-air intercepts (traffic lights, bus stops) expose users to environment; not reflected in safety score.

**Solution:**

- Air Quality API — hourly forecast up to 96h, 500m resolution, 100+ countries
- Pollen API — 5-day forecast, 1km resolution, heatmap tiles
- Optional heatmap overlay on journey map via deck.gl (Google architecture pattern)

**Integration points:**

- Extend intercept safety scoring for bike/walk modes
- TrackOrder environmental banner ("High AQI at your stop — consider enclosed intercept")

**Acceptance criteria:**

- [ ] AQI index available at intercept coordinates
- [ ] Walk/bike journeys show air quality warning above threshold

**Docs:**

- https://developers.google.com/maps/documentation/air-quality/overview
- https://developers.google.com/maps/documentation/pollen/overview
- https://developers.google.com/maps/architecture/air-quality-pollen-areas-routes

---

### Tier 5 — Future / Out of Scope (MVP)

Documented for completeness; not planned for initial enhancement phases.

| API | Rationale |
|-----|-----------|
| **Fleet Engine + JS Fleet Tracking Library** | Swiggy owns last-mile delivery; relevant only if RouteBite orchestrates own riders |
| **Navigation SDK** | Turn-by-turn to intercept — nice-to-have post-MVP |
| **Maps Static API + cloud styling** | Shareable intercept preview images for notifications |
| **Elevation API** | Steep grade penalty for bike delivery — low priority |
| **Solar API** | Not relevant to food delivery |

---

## Integration Roadmap

### Phase 1 — Backend accuracy (Weeks 1–3)

**Goal:** Replace placeholders; traffic- and weather-aware intercepts.

| ID | Enhancement | Owner layer |
|----|-------------|-------------|
| E2 | Routes `extraComputations` | `apps/api` maps + intercept |
| E3 | Departure-time routing | `apps/api` maps + routes |
| E1 | Places Aggregate restaurant counts | `apps/api` maps + intercept |
| E4 | Weather API safety + buffers | `apps/api` new weather service |

**Exit criteria:** Intercept scores use real data; journey analyze returns weather warnings.

---

### Phase 2 — Discovery (Weeks 3–5)

**Goal:** Smarter restaurant ranking and multi-stop support.

| ID | Enhancement | Owner layer |
|----|-------------|-------------|
| E5 | Text search along route + routing summaries | `apps/api` maps + intercepts routes |
| E6 | Native waypoint optimization | `apps/api` route-optimization |
| E7 | Granular place types + summaries | `apps/api` + web menu |

**Exit criteria:** Intercepts pre-validated for POI coverage; multi-stop optimization via Google.

---

### Phase 3 — Frontend maps (Weeks 5–8)

**Goal:** Visual product layer; replace demo UX.

| ID | Enhancement | Owner layer |
|----|-------------|-------------|
| E8 | Cloud map styling | `apps/web` components |
| E9 | Places UI Kit (Autocomplete, Search, Details) | `apps/web` pages |
| E10 | Photorealistic 3D Maps (optional premium UX) | `apps/web` components |

**Exit criteria:** RouteBuilder uses real autocomplete; Intercepts shows map with styled polyline and markers.

**Prototype note:** Use Maps Demo Key (https://goo.gle/4bXxQzG) for Phase 3 exploration before production billing.

---

### Phase 4 — Live alignment (Weeks 8–10)

**Goal:** Deliver on "sync" product promise.

| ID | Enhancement | Owner layer |
|----|-------------|-------------|
| E11 | Live customer GPS + Routes recompute | `apps/web` + `apps/api` tracking |
| E12 | Time Zone API | `apps/api` + web display |
| E13 | Air Quality overlays (optional) | `apps/web` map + api scoring |

**Exit criteria:** TrackOrder alignment driven by live customer position; weather/AQI warnings live.

---

### Roadmap diagram

```
Phase 1          Phase 2           Phase 3            Phase 4
────────         ────────          ────────           ────────
Places Aggregate  Search along     Cloud styling      Live GPS ETA
extraComputations  route            Places UI Kit      Time Zone
departureTime      Waypoint opt     3D Maps (opt)      Air Quality
Weather API        Place types
     │                  │                │                  │
     ▼                  ▼                ▼                  ▼
 Accurate           Better             Visual             True
 intercepts         discovery          product            alignment
```

---

## Architecture Impact

### New modules (planned)

```
apps/api/src/services/
├── maps/
│   ├── client.ts          # extend: aggregate, searchAlongRoute, extraComputations
│   ├── cache.ts           # extend: weather, aggregate TTLs
│   └── constants.ts       # extend: field masks, Weather/Places endpoints
├── weather/
│   ├── client.ts          # NEW
│   └── types.ts           # NEW
└── intercept/
    └── algorithm.ts       # modify: real counts, traffic dwell, weather

apps/web/src/
├── components/
│   ├── JourneyMap.tsx     # NEW — 2D styled map
│   └── JourneyMap3D.tsx   # NEW — optional 3D mode
└── pages/
    ├── RouteBuilder.tsx   # Places UI Kit Autocomplete
    ├── Intercepts.tsx     # map + Place Details
    └── TrackOrder.tsx     # live GPS + weather banner
```

### Data model extensions (optional)

| Table / field | Purpose |
|---------------|---------|
| `intercepts.weatherRisk` | Boolean or enum from public alerts at creation |
| `intercepts.googleRestaurantCount` | Cached Aggregate count |
| `tracking_events.customerLat/Lng` | Already in schema — start populating |
| `journeys.departureTime` | Planned departure for traffic-aware analyze |

### Caching strategy

| Data | TTL | Rationale |
|------|-----|-----------|
| Route polyline | 15–60 min | Traffic changes |
| Places Aggregate count | 1–24 h | Slow-changing |
| Weather hourly forecast | 1 h | API refresh cadence |
| Weather public alerts | 15 min | Safety-critical |
| Geocode | 7 days | Stable |
| Text search along route | 30 min | Session-scoped |

Extend existing `SimpleLRUCache` pattern in `apps/api/src/services/maps/cache.ts`.

---

## API Reference Quick Sheet

| API | Base URL / method | Auth |
|-----|-------------------|------|
| Routes v2 | `POST routes.googleapis.com/directions/v2:computeRoutes` | API key + field mask header |
| Route Matrix v2 | `POST routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` | API key + field mask |
| Places Aggregate | `POST places.googleapis.com/v1/places:computeInsights` | API key |
| Places Text Search | `POST places.googleapis.com/v1/places:searchText` | API key + field mask |
| Places Nearby | `POST places.googleapis.com/v1/places:searchNearby` | API key + field mask |
| Weather hourly | `GET weather.googleapis.com/v1/forecast/hours:lookup` | API key |
| Weather alerts | `GET weather.googleapis.com/v1/publicAlerts:lookup` | API key |
| Air Quality | `GET airquality.googleapis.com/v1/...` | API key |
| Maps JavaScript | Loaded client-side with Map ID | Browser-restricted key |
| Places UI Kit | Maps JavaScript API components | Same as Maps JS |

**Required headers (REST):**

```
X-Goog-Api-Key: YOUR_API_KEY
X-Goog-FieldMask: comma,separated,fields
Content-Type: application/json
```

---

## Billing & Cost Controls

### SKU tiers to monitor

| Feature | Typical SKU tier | Notes |
|---------|------------------|-------|
| Basic route | Routes Essentials / Basic | Polyline + duration |
| Traffic polylines | Routes **Preferred** | `TRAFFIC_ON_POLYLINE` |
| Waypoint optimization | Routes **Pro** | `optimizeWaypointOrder` |
| Places Aggregate | Places Aggregate | Per insight request |
| Places UI Kit | Places UI Kit | Often cheaper than raw Places for UI |
| Weather | Weather API | Separate product |
| Dynamic Maps | Dynamic Maps | Per map load |

### Cost control measures (already partially in place)

1. **Field masks** — request only needed fields (Routes API enforced)
2. **LRU caching** — extend to new APIs (see Caching strategy)
3. **Batch Aggregate calls** — dedupe candidates within 300m before calling
4. **Session tokens** — Places Autocomplete → Details sessions for billing efficiency
5. **Client-side map loads** — lazy-load map components; don't mount on Landing until needed
6. **Demo key** — Phase 3 prototyping only; separate production project with budgets/alerts

### Google Cloud setup checklist

- [ ] Enable APIs: Routes, Places (New), Places Aggregate, Weather, Maps JavaScript, Places UI Kit
- [ ] Create Map ID(s) for web styling
- [ ] Set daily quota alerts
- [ ] Restrict API keys (server IP for API; HTTP referrer for Maps JS)
- [ ] Review Maps Demo Key for dev/staging separation

---

## Environment & Configuration

### New environment variables (planned)

```bash
# Existing
GOOGLE_MAPS_API_KEY=           # Server-side Routes, Places, Weather
ENCRYPTION_KEY=

# New / split keys (recommended)
GOOGLE_MAPS_API_KEY_SERVER=    # Backend REST APIs
GOOGLE_MAPS_API_KEY_CLIENT=    # Maps JS + Places UI Kit (referrer-restricted)
GOOGLE_MAP_ID=                 # Cloud styling Map ID for web

# Optional
GOOGLE_WEATHER_LANGUAGE=en-IN
PLACES_AGGREGATE_RADIUS_M=500
WEATHER_CACHE_TTL_MS=3600000
```

### Feature flags (recommended)

```typescript
// packages/shared/src/constants.ts or env-driven
export const MAPS_FEATURES = {
  PLACES_AGGREGATE: true,
  ROUTES_EXTRA_COMPUTATIONS: true,
  WEATHER_SAFETY: true,
  LIVE_GPS_ALIGNMENT: false,  // Phase 4
  MAP_3D: false,              // Phase 3 optional
};
```

---

## Testing Strategy

### Unit tests

- Mock Google API responses for intercept scoring with known Aggregate counts
- Weather penalty logic — table-driven tests for precipitation / alert cases
- `extraComputations` field mask builder — snapshot tests

### Integration tests

- `apps/api/test-maps.ts`, `test-maps2.ts` — extend for Aggregate + Weather smoke tests
- Recorded fixtures for Routes traffic polyline responses

### Manual QA scenarios

| Scenario | Expected |
|----------|----------|
| Bangalore car journey, 8:30 AM departure | Traffic-aware duration > off-peak |
| Intercept at traffic jam segment | Higher dwell / score adjustment |
| Heavy rain forecast at intercept hour | Safety penalty + timing buffer |
| Cyclone public alert on route | Warning on analyze; flag intercepts |
| RouteBuilder autocomplete | Real address → valid analyze |
| TrackOrder with GPS enabled | Alignment updates as user moves |

### Demo key testing

Use https://goo.gle/4bXxQzG for Phase 3 map UI development before enabling production SKUs.

---

## Risks & Constraints

| Risk | Mitigation |
|------|------------|
| API cost overrun on Analyze (many intercept candidates × Aggregate) | Batch/dedupe; cache; limit candidates before Aggregate |
| `optimizeWaypointOrder` incompatible with `TRAFFIC_AWARE_OPTIMAL` | Use `TRAFFIC_AWARE` for optimization requests |
| India flyover/narrow road data experimental | Feature-flag; graceful absence handling |
| Places UI Kit EEA billing differences | Verify terms for India deployment |
| Client-side API key exposure | Separate key; referrer restrictions; no server secrets in web bundle |
| GPS privacy | Consent modal; retention purge; no precise trail storage beyond alignment need |
| Swiggy + Google data mismatch | Present both sources; Google for discovery, Swiggy for orderability |
| Weather alert false positives | Show as warnings, don't hard-block without user override |

---

## Success Metrics

| Metric | Baseline | Target post-Phase 1–2 |
|--------|----------|------------------------|
| Intercepts with real restaurant count | 0% (hash) | 100% |
| Intercept score variance (same route, different times) | None | Measurable AM vs PM difference |
| Orders at intercepts with 0 Swiggy coverage attempted | Unknown | Near 0 (pre-validated) |
| Alignment score accuracy (customer waits >5 min) | Unknown | −30% poor-alignment orders |
| RouteBuilder address errors | High (demo list) | <5% invalid analyze |
| Map engagement (Phase 3) | 0 | >60% journeys viewed on map |

---

## References

### Google documentation

- [Places UI Kit GA blog](https://mapsplatform.google.com/resources/blog/places-ui-kit-is-now-generally-available-bring-googles-rich-places-content-to-any-map/)
- [3D Maps & granular place types blog](https://mapsplatform.google.com/resources/blog/transform-your-maps-with-new-tools-for-immersive-3d-experiences-and-granular-place-information/)
- [Cloud-based maps styling](https://developers.google.com/maps/documentation/javascript/cloud-customization)
- [Places Aggregate API](https://developers.google.com/maps/documentation/places-aggregate/overview)
- [Search along route](https://developers.google.com/maps/documentation/places/web-service/search-along-route)
- [Routing summaries](https://developers.google.com/maps/documentation/places/web-service/routing-summary-sar)
- [Routes traffic on polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines)
- [Waypoint optimization](https://developers.google.com/maps/documentation/routes/opt-way)
- [Routes migrate / extraComputations](https://developers.google.com/maps/documentation/routes/migrate-routes-preview)
- [Weather API overview](https://developers.google.com/maps/documentation/weather/overview)
- [Weather public alerts](https://developers.google.com/maps/documentation/weather/weather-alerts)
- [Air Quality API](https://developers.google.com/maps/documentation/air-quality/overview)
- [Pollen API](https://developers.google.com/maps/documentation/pollen/overview)
- [Air Quality + Pollen on routes (architecture)](https://developers.google.com/maps/architecture/air-quality-pollen-areas-routes)
- [Places UI Kit docs](https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview)
- [Maps Demo Key](https://goo.gle/4bXxQzG)

### RouteBite codebase

- Maps client: `apps/api/src/services/maps/client.ts`
- Intercept algorithm: `apps/api/src/services/intercept/algorithm.ts`
- Intercept scoring: `apps/api/src/services/intercept/scoring.ts`
- Order timing: `apps/api/src/services/order/timing.ts`
- Route optimization: `apps/api/src/services/route-optimization/index.ts`
- Tracking alignment: `apps/api/src/services/tracking/alignment.ts`
- Shared constants: `packages/shared/src/constants.ts`
- Web API layer: `apps/web/src/lib/api.ts`
- Graphify architecture report: `graphify-out/GRAPH_REPORT_APP.md`

---

## Document History

| Date | Change |
|------|--------|
| 2026-06-01 | Initial comprehensive plan — Google Maps Platform enhancement catalog and roadmap |
