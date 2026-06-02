import { Hono } from "hono";
import crypto from "crypto";

const authCodes = new Map<string, { verifier: string; expires: number }>();
const tokens = new Map<string, { userId: string; phone: string; issuedAt: number; expiresAt: number }>();

/** Dev token used by RouteBite seed script and E2E tests */
export const DEV_ACCESS_TOKEN = process.env.MOCK_DEV_ACCESS_TOKEN ?? "routebite-dev-token";
tokens.set(DEV_ACCESS_TOKEN, {
  userId: "dev_user",
  phone: "+919876543210",
  issuedAt: Date.now(),
  expiresAt: Date.now() + 86400_000 * 365,
});

export const authRouter = new Hono();

authRouter.get("/authorize", (c) => {
  const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope } = c.req.query();

  if (!client_id || !redirect_uri || !code_challenge || code_challenge_method !== "S256") {
    return c.json({ error: "invalid_request", error_description: "Missing required parameters" }, 400);
  }

  // Simulate phone+OTP flow — in mock we skip and generate code directly after a fake redirect
  const code = crypto.randomUUID();
  authCodes.set(code, { verifier: code_challenge, expires: Date.now() + 120_000 });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return c.redirect(redirectUrl.toString(), 302);
});

authRouter.post("/token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { grant_type, code, code_verifier, client_id, redirect_uri } = body;

  if (grant_type !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const record = authCodes.get(code);
  if (!record) {
    return c.json({ error: "invalid_grant", error_description: "Code not found or expired" }, 400);
  }

  // Simple PKCE check: hash verifier and compare to stored challenge
  const challenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
  if (challenge !== record.verifier) {
    return c.json({ error: "invalid_grant", error_description: "PKCE check failed" }, 400);
  }

  authCodes.delete(code);

  const accessToken = crypto.randomBytes(32).toString("hex");
  const expiresIn = 432000; // 5 days
  tokens.set(accessToken, {
    userId: `user_${Math.floor(Math.random() * 1e6)}`,
    phone: "+91-9876543210",
    issuedAt: Date.now(),
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: "mcp:tools mcp:resources mcp:prompts",
  });
});

authRouter.post("/logout", (c) => {
  const auth = c.req.header("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (token) tokens.delete(token);
  return c.json({ success: true });
});

export function getTokenData(token: string) {
  return tokens.get(token);
}

export function requireAuth(c: any) {
  const auth = c.req.header("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token || !tokens.has(token)) {
    return null;
  }
  return tokens.get(token)!;
}
