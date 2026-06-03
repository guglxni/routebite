# RouteBite

**Food and Instamart that meets you on the way.**

RouteBite is a journey-aware delivery orchestration app for India. It analyzes your route with Google Maps (traffic, tolls, weather), finds scored **intercept stops** along the way, and places Swiggy Food or Instamart orders timed so your meal is ready when you arrive.

Built for the [Swiggy Builders Club](https://builders.swiggy.com) MCP integration program.

---

## Demo flow

1. Plan a route (origin → destination, transport mode)
2. Review intercept points on an interactive map
3. Browse restaurants or Instamart products at a stop
4. Place an order (`now` or `auto`-timed)
5. Track rider vs. customer alignment live

---

## Architecture

```
┌─────────────┐     Bearer session      ┌──────────────┐
│  apps/web   │ ◄──────────────────────►│   apps/api   │
│ React PWA   │      REST /api/v1       │  Hono (Bun)  │
│ Vite + mapcn│                         └──────┬───────┘
└─────────────┘                                │
       │                              Google Maps APIs
       │                              (Routes, Places, Weather)
       │                                       │
       │                              Swiggy MCP (Food + Instamart)
       │                                       │
       └──────────────────────────────► apps/mock-swiggy (local dev)
```

| Package | Role |
|---------|------|
| `apps/web` | React PWA — landing, dashboard, map, orders, live tracking |
| `apps/api` | Hono API — routing, intercepts, OAuth, order placement, alignment |
| `apps/mock-swiggy` | Local MCP server mimicking Swiggy Food + Instamart tools |
| `packages/shared` | Shared types, constants, algorithms |
| `packages/db` | Drizzle schema + SQLite/libSQL client |

---

## Tech stack

- **Runtime:** [Bun](https://bun.sh)
- **API:** [Hono](https://hono.dev) + Zod validation
- **Frontend:** React 19, Vite, shadcn/ui, [mapcn](https://mapcn.dev) (MapLibre)
- **Maps:** Google Routes API v2, Places, Weather
- **Swiggy:** MCP tool calls (Food + Instamart servers)
- **DB:** Drizzle ORM + SQLite (dev) / libSQL (prod-ready)

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- Google Maps Platform API key (Routes, Geocoding, Places, Weather enabled)
- Swiggy MCP credentials (production) or mock server (local)

### 1. Install

```bash
git clone https://github.com/guglxni/routebite.git
cd routebite
bun install
```

### 2. Configure API

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set ENCRYPTION_KEY and GOOGLE_MAPS_API_KEY
openssl rand -hex 32   # generate ENCRYPTION_KEY
```

### 3. Database

```bash
bun run db:push
bun run seed:dev-user   # local dev session + mock Swiggy token
```

### 4. Run all services

```bash
bun run dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:8787 |
| Mock Swiggy MCP | http://localhost:8788 |

**Dev auth:** After seeding, use `Authorization: Bearer routebite-dev-session` on API calls. The web app auto-logs in via dev session on protected routes.

---

## Testing

```bash
bun run test:api              # Unit tests
bun run test:api:integration  # Maps integration (needs GOOGLE_MAPS_API_KEY)
RUN_E2E=1 bun run test:api:e2e   # Full flow (API + mock Swiggy running)
bun run test:web
RUN_WEB_INTEGRATION=1 bun run test:web:integration
bun run typecheck
bun run build
```

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/routes/analyze` | Geocode + route + intercept scoring |
| `GET` | `/api/v1/routes/:journeyId` | Journey detail + decoded polyline |
| `GET` | `/api/v1/routes/:journeyId/intercepts` | Intercept points for journey |
| `GET` | `/api/v1/intercepts/:id/restaurants` | Swiggy Food near intercept |
| `GET` | `/api/v1/intercepts/:id/products` | Instamart near intercept |
| `POST` | `/api/v1/orders` | Place order (now or auto-timed) |
| `GET` | `/api/v1/orders/:id/track` | Live tracking + alignment score |
| `GET` | `/api/v1/railways/:trainNumber/run` | NTES live train trajectory + halts |
| `PATCH` | `/api/v1/routes/:journeyId/telemetry` | Live GPS + vehicle profile updates |
| `GET` | `/api/v1/auth/authorize` | Start Swiggy OAuth (PKCE) |
| `GET` | `/api/v1/auth/callback` | OAuth callback → session token |

All protected routes require `Authorization: Bearer <session_token>`.

Train mode uses NTES (Indian Railways) for live station halts and intercept ETAs when `transportMode=train` and a 5-digit train number is set.

---

## Environment variables

See [`apps/api/.env.example`](apps/api/.env.example).

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | Yes | AES-256 key for Swiggy token encryption |
| `GOOGLE_MAPS_API_KEY` | Yes | Google Maps Platform |
| `SWIGGY_MCP_BASE` | Prod | Swiggy MCP endpoint |
| `SWIGGY_CLIENT_ID` | Prod | OAuth client ID from Builders Club |
| `SWIGGY_REDIRECT_URI` | Prod | OAuth redirect (must match registration) |
| `WEB_ORIGIN` | Prod | CORS allowed origin |
| `DATABASE_URL` | No | Default `file:./local.db` |
| `REDIS_URL` | Prod (scale) | Distributed rate limiting |
| `STRUCTURED_LOGS` | No | `1` = JSON access logs in dev |

---

## Documentation

- [Product spec](spec.md) · [PRD](prd.md)
- [Security policy](SECURITY.md) · [OWASP audit](apps/api/SECURITY_AUDIT.md)
- [Google Maps roadmap](docs/google-maps-enhancements.md)

---

## Project status

MVP with end-to-end local flow: route analysis (including NTES train journeys) → intercept selection → menu → order → live tracking with rider context. Mock Swiggy MCP for development; production swaps to live Swiggy MCP via env config.

---

## License

MIT — see [LICENSE](LICENSE).
