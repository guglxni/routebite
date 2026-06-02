# RouteBite Security Audit — OWASP Top 10 (2025)

**Scope:** `apps/api`, `apps/web`, `apps/mock-swiggy`, `packages/db`  
**Last reviewed:** 2026-06-02  
**Status:** Pre-production MVP — suitable for Builders Club demo; address P2 items before scale.

---

## Executive Summary

| # | Category | Risk | Status |
|---|----------|------|--------|
| A01 | Broken Access Control | LOW | ✅ Fixed — ownership checks on orders, journeys, intercepts |
| A02 | Security Misconfiguration | LOW | ✅ Mitigated — required `ENCRYPTION_KEY`, security headers, CORS via env |
| A03 | Injection | LOW | ✅ Safe — Drizzle parameterized queries, Zod validation |
| A04 | Cryptographic Failures | LOW | ✅ Mitigated — AES-256-GCM at rest, TLS in production |
| A05 | Insecure Design | LOW | ⚠️ In-memory rate limit (OK for MVP) |
| A06 | Vulnerable Components | LOW | ✅ Acceptable — lockfile pinned, regular `bun update` recommended |
| A07 | Auth Failures | LOW | ✅ Mitigated — PKCE OAuth, session hash at rest, token expiry |
| A08 | Software/Data Integrity | LOW | ✅ Safe — no user-controlled deserialization |
| A09 | Logging & Monitoring | LOW | ⚠️ Basic request IDs; add structured security logging for prod |
| A10 | SSRF | LOW | ✅ Safe — outbound URLs are constants, not user-controlled |

---

## A01: Broken Access Control — ✅ REMEDIATED

**Previous issue:** IDOR on orders and intercepts.

**Current state:**
- `requireOrderOwnership()` on all order routes (`apps/api/src/routes/orders.ts`)
- `requireInterceptOwnership()` on intercept routes (`apps/api/src/routes/intercepts.ts`)
- Journey routes scoped with `eq(journeys.userId, user.id)` (`apps/api/src/routes/routes.ts`)
- Returns **404** (not 403) on unauthorized access to prevent ID enumeration

---

## A02: Security Misconfiguration — ✅ MITIGATED

| Control | Implementation |
|---------|------------------|
| Encryption key | `ENCRYPTION_KEY` required at startup — server crashes if missing (`auth.ts`) |
| Security headers | `securityHeadersMiddleware` — CSP, HSTS, X-Frame-Options, nosniff |
| CORS | `WEB_ORIGIN` env var (defaults to localhost in dev) |
| Dev tokens | Hardcoded dev session only in seed script + mock — not used when live Swiggy configured |
| Secrets in repo | `.env`, `*.db`, session archives in `.gitignore` |

**Remaining (P2):** Tighten CSP for production (remove `'unsafe-eval'` if bundle allows).

---

## A03: Injection — ✅ SAFE

- All DB access via Drizzle ORM with bound parameters
- Request bodies validated with Zod (`@hono/zod-validator`)
- No `eval`, no shell execution of user input

---

## A04: Cryptographic Failures — ✅ MITIGATED

- Swiggy access tokens: **AES-256-GCM** with random IV + auth tag (`encryptToken` / `decryptToken`)
- Session tokens: **SHA-256 hash** stored in DB; plaintext never persisted
- PKCE **S256** for OAuth authorization code flow

---

## A05: Insecure Design — ⚠️ ACCEPTABLE FOR MVP

- Rate limiting uses in-memory `Map` — resets on restart, not multi-instance safe
- **Recommendation:** Redis-backed limiter before horizontal scaling

---

## A07: Authentication Failures — ✅ MITIGATED

| Check | Status |
|-------|--------|
| PKCE OAuth flow | ✅ |
| Token expiry enforcement | ✅ |
| Session token hashing | ✅ |
| Swiggy token encryption at rest | ✅ |
| MFA | N/A for MVP |

---

## A09: Logging Failures — ⚠️ PARTIAL

- Request ID middleware on all requests
- Unhandled errors logged server-side; generic message to client
- **Recommendation:** Add auth failure + rate-limit breach metrics in production

---

## A10: SSRF — ✅ SAFE

Google Maps and Swiggy MCP URLs are fixed configuration. User addresses are sent as API payload fields, not as fetch URLs.

---

## Pre-commit security checklist

Before pushing to GitHub:

- [ ] `apps/api/.env` not tracked (`git check-ignore apps/api/.env`)
- [ ] No `*.db` files staged
- [ ] No API keys in source or markdown history
- [ ] `.env.example` contains placeholders only

---

## Remediation backlog (production)

1. **P2** — Redis rate limiter for distributed deployments
2. **P2** — Structured security event logging (failed auth, ownership violations)
3. **P2** — CSP hardening for production web build
4. **P3** — Token refresh flow for expired Swiggy access tokens
5. **P3** — Dependency scanning in CI (Dependabot / `bun audit`)

---

## Agentic AI considerations (2026)

RouteBite does not expose LLM tool execution to end users. MCP calls are server-side only with scoped Swiggy OAuth tokens. No prompt injection surface on the API.
