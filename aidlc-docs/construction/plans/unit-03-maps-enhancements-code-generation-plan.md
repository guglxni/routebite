# Unit 03: Google Maps Service Client — Code Generation Plan

## AI-DLC Context
- **Unit**: 03 — Google Maps Service Client
- **Phase**: Construction
- **Reference**: [docs/google-maps-enhancements.md](../../docs/google-maps-enhancements.md) Phase 1 (E1–E4)

## Scope Delivered

| Enhancement | Implementation |
|---|---|
| E1 Places Aggregate | `apps/api/src/services/maps/places.ts` — `PlacesInsightsClient` with Nearby fallback |
| E2 Routes extraComputations | `DEFAULT_ROUTE_EXTRA_COMPUTATIONS` + extended field masks in `constants.ts` |
| E3 departureTime routing | `computeRoute()` opts + `AnalyzeRouteSchema.departureTime` |
| E4 Weather safety/timing | `apps/api/src/services/weather/client.ts` + intercept enrichment |

## Architecture

```
routes.ts (POST /analyze)
  └─ mapsClient.computeRoute(departureTime, extras)
  └─ computeInterceptPoints()
       └─ extractCandidates()        # heuristic fallback counts
       └─ enrichCandidates()         # Places + traffic dwell + toll merge + weather
       └─ scoreInterceptPoint()
       └─ snapToRoads()
```

## Shared Configuration
- `packages/shared/src/constants.ts` — `MAPS_CONFIG`, `MAPS_FEATURES`

## Feature Flags (all Phase 1 enabled by default)
- `PLACES_AGGREGATE`, `ROUTES_EXTRA_COMPUTATIONS`, `DEPARTURE_TIME_ROUTING`
- `WEATHER_SAFETY`, `WEATHER_ALERTS`, `TRAFFIC_DWELL_ADJUSTMENT`

## Files Created/Modified
- **New**: `places.ts`, `weather/client.ts`, `intercept/enrichment.ts`, `intercept/traffic.ts`
- **Modified**: `maps/client.ts`, `maps/constants.ts`, `maps/types.ts`, `maps/cache.ts`
- **Modified**: `intercept/algorithm.ts`, `routes/routes.ts`, `order/timing.ts`
- **Tests**: `apps/api/tests/unit/*`, `apps/api/tests/integration/maps.integration.test.ts`

## Out of Scope (Phase 2+)
- Places UI Kit, 3D Maps, waypoint optimization, live GPS alignment

## Environment
- `GOOGLE_MAPS_API_KEY` — required for live integration tests and smoke script
