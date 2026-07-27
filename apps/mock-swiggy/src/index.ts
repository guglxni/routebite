import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { foodRouter } from "./food.js";
import { instamartRouter } from "./instamart.js";
import { authRouter } from "./auth.js";

const app = new Hono();

app.use(cors({ origin: "*", credentials: true }));
app.use(logger());

app.get("/", (c) => c.json({ ok: true, service: "Mock Swiggy MCP v1.0" }));

// OAuth metadata
app.get("/.well-known/oauth-authorization-server", (c) =>
  c.json({
    issuer: "https://mcp.swiggy.com",
    authorization_endpoint: "http://localhost:8788/auth/authorize",
    token_endpoint: "http://localhost:8788/auth/token",
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
    scopes_supported: ["mcp:tools"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  })
);

app.route("/auth", authRouter);
app.route("/food", foodRouter);
// Live Builders Club path is /im; keep /instamart as a local alias.
app.route("/im", instamartRouter);
app.route("/instamart", instamartRouter);

// Health
app.get("/health", (c) => c.json({ status: "ok", servers: ["food", "im"] }));

const port = 8788;
console.log(`🍔 Mock Swiggy MCP running on http://localhost:${port}`);
console.log(`   Food:      http://localhost:${port}/food`);
console.log(`   Instamart: http://localhost:${port}/im  (alias /instamart)`);
console.log(`   Auth:      http://localhost:${port}/auth/authorize`);

export default {
  port,
  fetch: app.fetch,
};
