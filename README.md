<p align="center">
  <img src="docs/assets/logo-512.png" alt="RouteBite" width="120" />
</p>

<h1 align="center">RouteBite</h1>

<p align="center">
  <strong>Food and Instamart that meets you on the way.</strong>
</p>

<p align="center">
  <a href="https://routebite-five.vercel.app"><img src="https://img.shields.io/badge/Live_demo-routebite--five.vercel.app-2563eb?style=for-the-badge&logo=vercel" alt="Live demo" /></a>
  &nbsp;
  <a href="https://github.com/guglxni/routebite/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/guglxni/routebite/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI" /></a>
  &nbsp;
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/Security-OWASP-16a34a?style=for-the-badge" alt="Security" /></a>
</p>

<p align="center">
  <a href="https://routebite-five.vercel.app"><strong>https://routebite-five.vercel.app</strong></a>
  · Journey-aware Swiggy Food &amp; Instamart · Google Maps · NTES trains
</p>

---

RouteBite is a journey-aware delivery orchestration app for India. It analyzes your route with Google Maps (traffic, tolls, weather), finds scored **intercept stops** along the way, and places Swiggy Food or Instamart orders timed so your meal is ready when you arrive.

Built for the [Swiggy Builders Club](https://builders.swiggy.com) MCP integration program.

### Live demo

| Surface | URL |
|---------|-----|
| **Web (Vercel)** | **[https://routebite-five.vercel.app](https://routebite-five.vercel.app)** |
| Source | [github.com/guglxni/routebite](https://github.com/guglxni/routebite) |

Portal demo logins (when portal mode is enabled on the API): `user` / `user123`, `rider` / `rider123`, `admin` / `admin123`.

---

## Demo flow

1. Plan a route (origin → destination, transport mode)
2. Review intercept points on an interactive map
3. Browse restaurants or Instamart products at a stop
4. Place an order (`now`, `auto`-timed, or multi-hop)
5. Track rider vs. customer alignment live (dual-clock)

---

## Architecture

![System architecture](docs/diagrams/system-architecture.png)

Editable source: [`docs/diagrams/system-architecture.drawio`](docs/diagrams/system-architecture.drawio) · [all diagrams](docs/diagrams/README.md)

| Package | Role |
|---------|------|
| `apps/web` | React PWA — landing, dashboards (traveller / rider / admin), map, orders, live tracking |
| `apps/api` | Hono API — routing, intercepts, OAuth, fusion timing, order placement, alignment |
| `apps/mock-swiggy` | Local MCP server mimicking Swiggy Food + Instamart tools |
| `packages/shared` | Shared types, constants, algorithms |
| `packages/db` | Drizzle schema + SQLite/libSQL client |

---

## Order & fusion pipeline

![Order and fusion flowchart](docs/diagrams/order-fusion-flow.png)

Fusion services (`apps/api/src/services/fusion/`) add corridor coverage, deferred placement, halt-gates for trains, hop packing, isochrone deepening, meal priming, and re-intercept when clocks diverge.

---

## Security trust boundaries

![Security architecture](docs/diagrams/security-trust-boundaries.png)

See [`SECURITY.md`](SECURITY.md) and the OWASP audit [`apps/api/SECURITY_AUDIT.md`](apps/api/SECURITY_AUDIT.md).

---

## CI/CD & deployment

![CI/CD deployment](docs/diagrams/cicd-deployment.png)

| Target | Notes |
|--------|------|
| **Vercel** | Static web → [routebite-five.vercel.app](https://routebite-five.vercel.app) |
| **AWS Lightsail** | Docker (`Dockerfile.runtime`) — API + OpenResty + optional mock MCP |
| **GitHub Actions** | `ci.yml` (unit, typecheck, Maps compliance, gitleaks) · `security.yml` (audit + weekly scan) |

Local gate: `bun run ci:local`

---

## Tech stack

- **Runtime:** [Bun](https://bun.sh)
- **API:** [Hono](https://hono.dev) + Zod validation
- **Frontend:** React 19, Vite, shadcn/ui, [mapcn](https://mapcn.dev) (MapLibre)
- **Maps:** Google Routes API v2, Places, Weather, Isochrones
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
bun run check:maps
bun run ci:local
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
- [Swiggy MCP gap analysis](docs/SWIGGY_MCP_GAP_ANALYSIS.md)
- [Architecture & flow diagrams](docs/diagrams/README.md)

---

## Project status

MVP with end-to-end flow: route analysis (including NTES train journeys) → intercept selection → menu → order → live tracking with fusion alignment. Mock Swiggy MCP for development; production swaps to live Swiggy MCP via env config. Live web: [https://routebite-five.vercel.app](https://routebite-five.vercel.app).

---

## License

Proprietary — all rights reserved. See [LICENSE](LICENSE). Commercial use, redistribution, and sublicensing require written permission from the copyright holder.
