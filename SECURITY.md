# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main`  | Yes       |

## Reporting a vulnerability

Please **do not** open public GitHub issues for security reports.

Email **security@routebite.dev** (or open a private GitHub Security Advisory on this repo) with:

- Description and impact
- Steps to reproduce
- Affected endpoints or components

We aim to acknowledge reports within 72 hours.

## Security architecture (summary)

- **Authentication:** OAuth 2.1 + PKCE with Swiggy; opaque session tokens hashed (SHA-256) at rest
- **Token storage:** Swiggy access tokens encrypted with AES-256-GCM (`ENCRYPTION_KEY` required at startup)
- **Authorization:** Resource endpoints enforce user ownership (orders, journeys, intercepts)
- **Input validation:** Zod schemas on all API inputs; Drizzle ORM parameterized queries
- **Headers:** HSTS (production), CSP, X-Frame-Options, nosniff (see `security-headers.ts`)
- **Rate limiting:** Token-bucket per IP; set `REDIS_URL` for multi-instance deployments
- **Logging:** Structured JSON security events and access logs in production (`STRUCTURED_LOGS=1` in dev)
- **Errors:** Fail-closed; no stack traces in API responses

Full OWASP Top 10 audit: [`apps/api/SECURITY_AUDIT.md`](apps/api/SECURITY_AUDIT.md)

## Secrets handling

- Copy `apps/api/.env.example` → `apps/api/.env`
- Never commit `.env`, database files, session archives, PEM keys, or deploy link state (`.openship/`, `openship.json`)
- Live demo: [https://routebite-five.vercel.app](https://routebite-five.vercel.app) — treat portal passwords as public demo credentials only
- Rotate `ENCRYPTION_KEY` only with a migration plan (re-encrypts stored tokens)
- Secret scan: `gitleaks detect` (CI + `bun run ci:local`); config in `.gitleaks.toml`

## Google Maps Platform agent-skills / AI-DLC

Governance sources installed in-repo:

- `.agents/skills/google-maps-platform` — [googlemaps/agent-skills](https://github.com/googlemaps/agent-skills)
- `.agents/skills/gcloud` — [google/skills](https://github.com/google/skills)
- `.cursor/rules/google-maps-aidlc.mdc` — Cursor agent steering

**Compliance gate:** `./scripts/check-maps-compliance.sh` (also runs in `.github/workflows/ci.yml`).

Hardening notes from official skills:

- No legacy Maps JS (`Marker` / `Autocomplete` / `DirectionsService`)
- Browser never calls Maps REST (CORS) — API proxy in `apps/api`
- Places Aggregate + Cloud Route Optimization use **ADC/OAuth**, not API keys
- Client Maps JS: `language=en`, `region=IN`, Places UI Kit `PlaceAutocompleteElement`
- Do not use Maps content to train ML models; geospatial cache TTLs ≪ 30 days
- Live GPS requires explicit user consent (revocable toggle)

## GCP FinOps / DevSecOps (Maps Platform)

Baseline for the Maps GCP project (see `scripts/harden-gcp-finops-secops.sh`):

| Control | Practice |
|---------|----------|
| **Budgets** | Monthly INR budget with 50/80/90/100% current + 100% forecasted alerts |
| **Quotas** | Consumer overrides for daily + per-minute Maps/Isochrones/Places/Routes |
| **Labels** | `app`, `env`, `cost-center`, `owner`, `finops` for cost allocation |
| **Audit logs** | `allServices` ADMIN_READ / DATA_READ / DATA_WRITE |
| **API keys** | API-target restricted; prefer split server (IP) vs client (HTTP referrer) keys |
| **Contacts** | Essential contacts for billing / security / suspension |
| **CI** | `.github/workflows/security.yml` (gitleaks) + Dependabot |

```bash
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
GCP_PROJECT=gmp-demo-project-713039209 \
GCP_BILLING_ACCOUNT=01820F-8D7816-3967E8 \
./scripts/harden-gcp-finops-secops.sh

# Optional application lock (pick one style per key — don't mix on one key):
KEY_ALLOWED_IPS=YOUR.PUBLIC.IP ./scripts/harden-gcp-finops-secops.sh
# or
KEY_ALLOWED_REFERRERS='http://localhost:3000/*,https://your.domain/*' ./scripts/harden-gcp-finops-secops.sh
```

Never paste live API keys into chat, tickets, or commits. Rotate if exposed.
