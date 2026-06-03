# RouteBite — Development Log & Technical Reference

This document summarizes major development work on RouteBite: features shipped, security hardening, data-structure choices, and how to extend the codebase.

**Last updated:** 2026-06-03  
**Repository:** [github.com/guglxni/routebite](https://github.com/guglxni/routebite)

---

## Table of contents

1. [Product features](#product-features)
2. [NTES train tracking](#ntes-train-tracking)
3. [Rider & customer context](#rider--customer-context)
4. [Frontend polish](#frontend-polish)
5. [Security (OWASP)](#security-owasp)
6. [Algorithms & data structures](#algorithms--data-structures)
7. [API reference additions](#api-reference-additions)
8. [Testing](#testing)
9. [Environment variables](#environment-variables)

---

## Product features

RouteBite orchestrates Swiggy Food and Instamart delivery along a user's journey:

| Flow | Description |
|------|-------------|
| Route analyze | Google Routes + intercept scoring along polyline |
| Intercept selection | Ranked stops with dwell time, restaurants, safety |
| Order placement | `now` or `auto`-timed via shared timing formula |
| Live tracking | Rider vs customer alignment + ETA |

Transport modes: car, bus, train, metro, bike, walk.

---

## NTES train tracking

Native TypeScript port of the NTES (National Train Enquiry System) client — no Python sidecar.

### Structure

```
apps/api/src/services/railways/
├── ntes/
│   ├── crypto.ts      # AES-128-CBC + MD5 signing (setAutoPadding(false))
│   ├── client.ts      # Session warmup, trainInfo, liveStatus, schedule
│   ├── parse.ts       # Live status field mapping (LSTN, STNS, …)
│   ├── stations.ts    # STNS trajectory, halt/ETA, polyline encode
│   └── station-code.ts
├── train-run.ts       # Cached NTES orchestrator (TtlLruCache, 45s TTL)
├── train-journey.ts   # Geocode stations → intercepts + route polyline
└── tracker.ts
```

### Integration points

- **`POST /api/v1/routes/analyze`** — when `transportMode=train` + `trainNumber`, uses NTES instead of Google Transit
- **`GET /api/v1/railways/:trainNumber/run`** — live trajectory + delivery-friendly halts
- **`GET /api/v1/routes/:journeyId/intercepts`** — live `etaSeconds` per station intercept
- **Order placement & track** — NTES ETA drives auto-timing and customer context

### Critical fix

Node/Bun `createCipheriv` auto-PKCS7 padding stacked on manual NTES padding → empty responses. Fixed with `cipher.setAutoPadding(false)`.

### Tests

- `tests/unit/ntes.test.ts` — crypto roundtrip vs Python reference
- `tests/unit/ntes-stations.test.ts` — halt/ETA parsing
- `tests/integration/ntes.integration.test.ts` — live call with `RUN_NTES_INTEGRATION=1`

---

## Rider & customer context

Swiggy riders receive journey-aware delivery instructions; customers see alignment on the track page.

| File | Role |
|------|------|
| `services/order/rider-brief.ts` | Builds landmark/instructions from vehicle profile |
| `services/tracking/customer-context.ts` | Vehicle, intercept, live GPS, NTES ETA |
| `routes/orders.ts` | Track endpoint returns `customerContext` |
| `pages/TrackOrder.tsx` | Map: rider + customer + intercept; “Rider sees” card |

Train orders use NTES departure ETAs; road orders use route projection ETAs.

---

## Frontend polish

- **Brand:** `RouteBiteLogo.tsx`, PNG assets in `apps/web/public/`
- **Journey UI:** `TripVehicleFields`, `LiveLocationPanel`, `TrainStatusPanel`, `QuickRouteForm`
- **Orders page:** SpotlightCard layout, fixed GSAP opacity issues
- **Nav:** Home / main links in `AppSidebar`, `DashboardShell`
- **Map:** Journey map shows rider, customer, intercept for train orders

---

## Security (OWASP)

Full audit: [`apps/api/SECURITY_AUDIT.md`](../apps/api/SECURITY_AUDIT.md)

### Remediated

| Item | Implementation |
|------|----------------|
| **A01 Access control** | `denyAccess()` logs IDOR attempts; opaque 404 |
| **A05 Rate limiting** | Token-bucket memory store + optional Redis (`REDIS_URL`) |
| **A09 Logging** | Structured JSON security + access logs in production |
| **Data minimization** | Swiggy `raw` omitted from track API in production |
| **NTES** | Auth-gated routes; 5-digit train number validation; bounded caches |

### Security event types

`auth.missing_token`, `auth.invalid_session`, `auth.expired_token`, `rate_limit.exceeded`, `access.denied`, `validation.failed`

Enable structured access logs in dev: `STRUCTURED_LOGS=1`

---

## Algorithms & data structures

Shared utilities live in **`@routebite/shared/algorithms`** (used by API and web).

### Core primitives

| Module | Purpose | Complexity |
|--------|---------|------------|
| `MinHeap` | Streaming top-k | O(log k) push/pop |
| `selectTopK` | Best k items without full sort | O(n log k) |
| `compareInterceptRank` | Score desc, ETA asc tie-break | O(1) |
| `GeohashSpatialIndex` | Grid + 8-neighbor spatial lookup | O(1) cell lookup |
| `selectSpacedPoints` | Greedy min-distance selection | O(n) or O(n·9) with grid |
| `haversineMeters` | Great-circle distance | O(1) |
| `TtlLruCache` | Maps/NTES cache with TTL + LRU | O(1) get/set |
| `indexByKey` | Build Map index from array | O(n) |

### Thresholds (`INTERCEPT_ALGORITHMS`)

```typescript
GEOHASH_SPATIAL_THRESHOLD: 100  // use grid above this count
TOP_K_HEAP_THRESHOLD: 50          // heap pre-filter above this count
TOP_K_POOL_MULTIPLIER: 10         // pre-filter pool = maxPoints × 10
```

### Where used

| Location | Algorithm |
|----------|-----------|
| `intercept/scoring.ts` | `selectTopK` + `selectSpacedPoints` |
| `intercept/algorithm.ts` | `GeohashSpatialIndex` for candidate dedup |
| `railways/train-journey.ts` | Batch Places counts; `buildStationIndex` O(1) ETA |
| `railways/train-run.ts` | `TtlLruCache` |
| `maps/cache.ts` | `TtlLruCache` for all Google response caches |
| `rate-limit/` | Token bucket + Redis INCR |
| `web/Intercepts.tsx`, `Dashboard.tsx` | `selectTopK` for ranked lists |

### DSA consolidation (2026-06-03)

- Four duplicate haversine implementations → `@routebite/shared/algorithms/geo`
- Two LRU implementations → `TtlLruCache` + plain `LruCache`
- Linear `stations.find()` → `buildStationIndex` Map
- Sequential restaurant API calls on trains → batched grid-deduped Places calls

---

## API reference additions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/railways/:trainNumber/status` | NTES live status summary |
| `GET` | `/api/v1/railways/:trainNumber/run` | Full station trajectory + halts |
| `PATCH` | `/api/v1/routes/:journeyId/telemetry` | Live GPS + vehicle profile |

Rate limit response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Testing

```bash
bun run typecheck
bun run test:api                    # 50+ unit tests
RUN_NTES_INTEGRATION=1 bun run test:api:integration
bun run build
```

Key test files:

- `tests/unit/shared-algorithms.test.ts` — heap, geohash, spacing
- `tests/unit/scoring.test.ts` — intercept filter/rank
- `tests/unit/rate-limit.test.ts` — token bucket + security log shape
- `tests/unit/geo-collections.test.ts` — haversine, station index
- `tests/unit/ttl-lru-cache.test.ts` — cache eviction + TTL

---

## Environment variables

See [`apps/api/.env.example`](../apps/api/.env.example).

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | Required — AES-256-GCM for Swiggy tokens |
| `GOOGLE_MAPS_API_KEY` | Routes, Geocoding, Places, Weather |
| `REDIS_URL` | Production rate limit (multi-instance) |
| `STRUCTURED_LOGS` | `1` forces JSON access/security logs in dev |
| `NTES_TIMEOUT_MS` / `NTES_RETRIES` | Optional NTES tuning |
| `WEB_ORIGIN` | CORS allowed origin |

---

## Graphify knowledge graph

Architecture questions: read `graphify-out/GRAPH_REPORT.md` (god nodes, communities).  
After code changes: `graphify update .` (AST-only, no API cost).

Key communities:

- **Intercept pipeline** — `computeInterceptPoints`, `filterAndRankPoints`
- **NTES / railways** — `haversineM`, `buildStationIndex`, `selectStationWindow`
- **Rate limit** — `MemoryRateLimitStore`, `RedisRateLimitStore`
- **Shared algorithms** — `selectTopK`, `GeohashSpatialIndex`, `MinHeap`

---

## Related docs

- [README](../README.md) — quick start
- [PRD](../prd.md) — product requirements
- [Technical spec](../spec.md)
- [Google Maps roadmap](google-maps-enhancements.md)
- [Security audit](../apps/api/SECURITY_AUDIT.md)
