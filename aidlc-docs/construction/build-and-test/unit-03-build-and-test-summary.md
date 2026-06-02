# Unit 03 Build and Test Summary

## Build Verification
- TypeScript: `bun run typecheck` (monorepo)
- Unit tests: `bun run --cwd apps/api test`
- Integration (live Maps): `RUN_MAPS_INTEGRATION=1 bun run --cwd apps/api test:integration`
- Smoke script: `bun run --cwd apps/api test:maps-smoke`

## Test Framework

| Layer | Location | Gate |
|---|---|---|
| Unit | `apps/api/tests/unit/` | Always runs in CI |
| Integration | `apps/api/tests/integration/` | `RUN_MAPS_INTEGRATION=1` + `GOOGLE_MAPS_API_KEY` |
| Smoke | `apps/api/test-maps.ts` | Manual / pre-deploy |

## Unit Coverage
- **weather.test.ts** — `buildWeatherContext`, `applyWeatherToSafetyRating`
- **traffic.test.ts** — traffic dwell adjustment, toll candidate detection
- **places.test.ts** — grid dedup, aggregate→nearby fallback, resolve count
- **scoring.test.ts** — intercept scoring and spacing filter
- **timing.test.ts** — auto-place timing formula

## Integration Coverage (live API)
- Geocoding (Koramangala) — skipped gracefully if API disabled
- Routes with `departureTime` + extraComputations (LatLng coords, no geocode dependency)
- Places restaurant count (falls back to heuristic if Places APIs disabled)
- Weather context
- Full `enrichCandidates()` pipeline

## Required Google Cloud APIs
Enable on the GCP project tied to `GOOGLE_MAPS_API_KEY`:
- **Phase 1 core**: Routes API, Geocoding API, Places API (New), Area Insights API, Weather API
- **Optional**: Route Matrix API, Roads API, Address Validation API

Integration tests skip individual checks when an API returns `PERMISSION_DENIED` / `SERVICE_DISABLED`.
Unit tests always run without network access.

## API Response Additions
`POST /api/v1/routes/analyze` now returns:
- `hasTolls` — from Routes tollInfo
- `weatherWarnings` — intercepts with active weather risk

## Request Additions
- Optional `departureTime` (ISO datetime) for traffic-aware routing

## Known Follow-ups
- Frontend API path mismatches (`/routes` vs `/routes/analyze`) — Unit 11
- Web missing intercept fetch endpoint — Unit 08
