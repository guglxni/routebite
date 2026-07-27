# Swiggy MCP — gap analysis vs Builders Club docs

**Sources consulted (2026-07-27):**
- [llms.txt](https://mcp.swiggy.com/builders/llms.txt)
- [Food reference](https://mcp.swiggy.com/builders/docs/reference/food/index.md) (14 tools)
- [Instamart reference](https://mcp.swiggy.com/builders/docs/reference/instamart/index.md) (13 tools)
- Per-tool `.md` schemas under `/docs/reference/{food,instamart}/*`
- [Errors](https://mcp.swiggy.com/builders/docs/reference/errors.md)
- [Ship to production](https://mcp.swiggy.com/builders/docs/build/ship-to-production.md)
- [Authenticate](https://mcp.swiggy.com/builders/docs/start/authenticate.md)
- Recipes: [order-food](https://mcp.swiggy.com/builders/docs/build/recipes/order-food.md), [order-groceries](https://mcp.swiggy.com/builders/docs/build/recipes/order-groceries.md)

This document records **pre-fix** gaps and the remediation landed in the same change set.

---

## 1. Transport protocol (Critical)

| Topic | Official | RouteBite (before) | Severity |
| --- | --- | --- | --- |
| Request body | JSON-RPC 2.0: `{ jsonrpc, method: "tools/call", params: { name, arguments }, id }` | Proprietary `{ tool, params }` | **Critical** — live MCP would reject |
| Endpoint Food | `POST https://mcp.swiggy.com/food` | `POST {base}/food` | OK path shape |
| Endpoint Instamart | `POST https://mcp.swiggy.com/im` | Was `/instamart`; fixed to `/im` | **High** (partially fixed earlier) |

**Fix:** Client speaks JSON-RPC; mock accepts JSON-RPC *and* legacy `{ tool, params }` for local demos.

---

## 2. Food tool argument schemas (High)

| Tool | Official required args | RouteBite (before) | Gap |
| --- | --- | --- | --- |
| `search_restaurants` | `addressId`, `query` (+ optional `offset`) | Often `lat`/`lng`/`query` only | Missing `addressId` |
| `get_restaurant_menu` | `addressId`, `restaurantId` (+ `page`/`pageSize`) | `restaurantId` only | Missing `addressId` |
| `search_menu` | `addressId`, `query` (+ `restaurantIdOfAddedItem`, `vegFilter`, `offset`) | Ad-hoc `restaurantId`/`query` | Wrong field names |
| `update_food_cart` | `restaurantId`, **`cartItems`**, `addressId` (+ optional `restaurantName`) | `items` instead of `cartItems`; no `addressId` | **Schema mismatch** |
| `get_food_cart` | `addressId` (+ optional `restaurantName`) | No args | Missing `addressId` |
| `apply_food_coupon` | **`couponCode`**, `addressId` (+ optional `cartId`) | `code` | Wrong param name |
| `place_food_order` | **`addressId`** (+ optional `paymentMethod`) | `paymentMethod` only | Missing `addressId` |
| `track_food_order` | optional `orderId` | `orderId` required in wrapper | Minor |
| `create_address` | **Not on Food server** | Was called on Food | Wrong server |

**Business rules from docs (not fully enforced before):**
- ₹1000 cart cap before `place_food_order`
- COD / `availablePaymentMethods` from `get_food_cart`
- Filter `availabilityStatus === "OPEN"`
- Do not blind-retry `place_food_order` — check `get_food_orders` first

---

## 3. Instamart tool argument schemas (High)

| Tool | Official required args | RouteBite (before) | Gap |
| --- | --- | --- | --- |
| `search_products` | `addressId`, `query` (+ `offset`) | `lat`/`lng`/`query` | Missing `addressId` |
| `update_cart` | **`selectedAddressId`**, `items[{ spinId, quantity }]` | No address; `productId` | Wrong identity + address field |
| `checkout` | **`addressId`** (+ optional `paymentMethod`) | `paymentMethod` only | Missing `addressId` |
| `track_order` | **`orderId`, `lat`, `lng`** | `orderId` only | Missing coords |
| `create_address` | `fullAddress`, `addressLine`, `addressLine2`, `city`, `postalCode`, `latitude`, `longitude`, `addressCategory`, `userName`, `userPhone`, … | `{ label, address, landmark }` | **Entire schema wrong** |
| Tool names | `search_products`, `update_cart`, `get_cart`, `checkout`, `track_order`, `get_orders`, … | Invented `*_instamart_*` names | Fixed earlier; params still wrong |

**Business rules:** ₹99 minimum; checkout also documents ₹1000 testing cap; multi-store checkout messaging.

---

## 4. Retry / idempotency (Medium)

| Official ([ship-to-production](https://mcp.swiggy.com/builders/docs/build/ship-to-production.md)) | RouteBite (before) |
| --- | --- |
| Backoff start **500ms**, double, jitter, cap ~5 retries | `BASE_DELAY_MS: 1000`, max 4 |
| Place/checkout: **never blind-retry** — poll `get_food_orders` / `get_orders` | Same retry loop as reads |
| Honour `Retry-After` on 429 (planned) | Partial via classify |
| Domain failures (`success: false` on HTTP 200) are terminal | Treated inconsistently |

---

## 5. Observability (Medium)

Docs recommend logging `session_id`, tool name, duration, hashed user id on every `callTool`. RouteBite had retries but no structured MCP call log.

---

## 6. Coverage vs catalog

| Server | Docs tools | Client wrappers (before this pass) | Notes |
| --- | --- | --- | --- |
| Food | 14 | Partial convenience set | Missing typed wrappers / wrong args for coupons, flush, search_menu |
| Instamart | 13 | Partial | Missing `your_go_to_items`, `delete_address`, `clear_cart` usage |
| Dineout | 8 | None | Out of MVP scope (RouteBite is intercept delivery, not table booking) |

---

## 7. Remediation checklist (this change set)

- [x] JSON-RPC request/response codec in `SwiggyMCPClient`
- [x] Mock `parseToolCall` accepts JSON-RPC + legacy
- [x] Typed Food/Instamart argument types matching docs
- [x] `update_food_cart` → `cartItems` + `addressId`
- [x] `place_food_order` / `checkout` require `addressId`
- [x] `create_address` full Instamart schema from intercept geocode
- [x] Instamart `update_cart` → `selectedAddressId` + `spinId`
- [x] Instamart `track_order` → `lat`/`lng` from intercept
- [x] Cart total gate (₹1000) before place/checkout
- [x] Non-idempotent place: check orders before retry
- [x] Retry base 500ms + jitter
- [x] MCP call structured log (tool, server, duration_ms, status)
- [x] Mock schemas updated; `/im` primary path
- [x] Agent rules (`AGENTS.md`, `.cursor/rules/swiggy.mdc`, `CLAUDE.md`)

---

## 8. Remaining known limits (explicit)

1. **Live Swiggy OAuth** still needs Builders Club prod credentials / allowlisted redirect URIs — MVP continues to run **mock MCP** on the VPS unless `SWIGGY_MCP_BASE` points at `https://mcp.swiggy.com`.
2. **Dineout** not integrated (by product scope).
3. **Cart item customization** (`variants` vs `variantsV2`) — mock uses simplified `itemId`/`variantId`; live path passes through `cartItems` as provided by the client UI.
4. **Symbolic `error.code` registry** is not live yet per docs — we keep message/HTTP classification and optional planned codes in mock.
5. Reverse-geocode → `city`/`postalCode` parsing is best-effort for intercept addresses.
