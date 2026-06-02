import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';
import { generatePKCE, buildAuthorizeUrl, exchangeCodeForToken } from '../services/swiggy/oauth';
import { RouteBiteError } from '../middleware/error-handler';
import { encryptToken, hashSessionToken } from '../middleware/auth';
import crypto from 'crypto';

const app = new Hono();

// In-memory store for pending PKCE flows (use Redis in production)
const pendingFlows = new Map<string, { codeVerifier: string; state: string }>();

// GET /api/v1/auth/swiggy — Start OAuth flow
app.get('/swiggy', (c) => {
  const pkce = generatePKCE();
  const url = buildAuthorizeUrl(pkce);

  // Store flow state
  pendingFlows.set(pkce.state, { codeVerifier: pkce.codeVerifier, state: pkce.state });

  // Clean up old entries after 2 minutes
  setTimeout(() => pendingFlows.delete(pkce.state), 120_000);

  return c.json({
    success: true,
    data: {
      authorizationUrl: url,
      state: pkce.state,
    },
  });
});

// GET /api/v1/auth/callback — OAuth callback
app.get('/callback', async (c) => {
  const { code, state } = c.req.query();

  if (!code || !state) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Missing code or state', 400);
  }

  const flow = pendingFlows.get(state);
  if (!flow) {
    throw new RouteBiteError('SESSION_REVOKED', 'Authorization session expired or invalid', 400);
  }
  pendingFlows.delete(state);

  // Exchange code for token
  const tokenRes = await exchangeCodeForToken(code, flow.codeVerifier);

  // NOTE: Swiggy OAuth does not expose a user-id endpoint.
  // We hash the access_token to create a pseudonymous stable identifier.
  // In production, integrate Swiggy's user-profile endpoint once available.
  const swiggyIdHash = crypto.createHash('sha256')
    .update(tokenRes.access_token)
    .digest('hex');

  const db = getDb();

  // Generate internal session token (opaque to Swiggy)
  const sessionToken = crypto.randomUUID();
  const tokenHash = hashSessionToken(sessionToken);

  // Encrypt Swiggy access token before storing
  const accessTokenEncrypted = encryptToken(tokenRes.access_token);

  const existing = await db.select().from(users).where(eq(users.swiggyIdHash, swiggyIdHash)).get();

  if (existing) {
    await db.update(users).set({
      sessionToken: tokenHash,
      accessTokenEncrypted,
      tokenExpiry: new Date(Date.now() + tokenRes.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({
      swiggyIdHash,
      sessionToken: tokenHash,
      accessTokenEncrypted,
      tokenExpiry: new Date(Date.now() + tokenRes.expires_in * 1000),
    });
  }

  // Return the opaque session token — frontend stores this as Bearer token
  return c.json({
    success: true,
    data: {
      token: sessionToken,
      expiresIn: tokenRes.expires_in,
    },
  });
});

export default app;
