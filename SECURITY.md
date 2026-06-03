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
- Never commit `.env`, database files, or session archives
- Rotate `ENCRYPTION_KEY` only with a migration plan (re-encrypts stored tokens)
