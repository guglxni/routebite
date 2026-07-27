import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';
import { PortalLoginSchema } from '@routebite/shared/schemas';
import { generatePKCE, buildAuthorizeUrl, exchangeCodeForToken } from '../services/swiggy/oauth';
import { RouteBiteError } from '../middleware/error-handler';
import { encryptToken, hashSessionToken } from '../middleware/auth';
import {
  findPortalAccount,
  portalDemoHints,
  portalHomePath,
} from '../services/auth/portal-accounts';
import { logSecurityEvent, requestLogContext, SecurityEvents } from '../lib/security-log';
import crypto from 'crypto';

const app = new Hono();

// In-memory store for pending PKCE flows (use Redis in production)
const pendingFlows = new Map<string, { codeVerifier: string; state: string }>();

const SESSION_TTL_S = 86400 * 90;

async function issueSessionForPortalUser(account: NonNullable<ReturnType<typeof findPortalAccount>>) {
  const db = getDb();
  const sessionToken = crypto.randomUUID();
  const tokenHash = hashSessionToken(sessionToken);
  // Dummy encrypted Swiggy token so existing decrypt path works for portal users
  const accessTokenEncrypted = encryptToken(`portal-mock-token:${account.username}`);
  const tokenExpiry = new Date(Date.now() + SESSION_TTL_S * 1000);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.swiggyIdHash, account.portalId))
    .get();

  if (existing) {
    await db
      .update(users)
      .set({
        username: account.username,
        email: account.email,
        name: account.name,
        role: account.role,
        sessionToken: tokenHash,
        accessTokenEncrypted,
        tokenExpiry,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({
      swiggyIdHash: account.portalId,
      username: account.username,
      email: account.email,
      name: account.name,
      role: account.role,
      sessionToken: tokenHash,
      accessTokenEncrypted,
      tokenExpiry,
    });
  }

  return {
    token: sessionToken,
    expiresIn: SESSION_TTL_S,
    role: account.role,
    name: account.name,
    email: account.email,
    username: account.username,
    homePath: account.homePath,
  };
}

// GET /api/v1/auth/portal — demo account hints for login UI
app.get('/portal', (c) => {
  return c.json({
    success: true,
    data: {
      mode: 'hardcoded',
      notice: 'Demo credentials only — not for production.',
      accounts: portalDemoHints(),
    },
  });
});

// POST /api/v1/auth/login — hardcoded portal login
app.post('/login', zValidator('json', PortalLoginSchema), async (c) => {
  const { username, password } = c.req.valid('json');
  const account = findPortalAccount(username, password);

  if (!account) {
    logSecurityEvent({
      event: SecurityEvents.AUTH_FAILED,
      ...requestLogContext(c),
      statusCode: 401,
      detail: { reason: 'invalid_portal_credentials', username: username.trim().toLowerCase() },
    });
    throw new RouteBiteError('UNAUTHORIZED', 'Invalid username or password', 401);
  }

  const session = await issueSessionForPortalUser(account);

  return c.json({
    success: true,
    data: session,
  });
});

// POST /api/v1/auth/logout — clear session hash for current bearer (best-effort)
app.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const tokenHash = hashSessionToken(authHeader.slice(7));
    const db = getDb();
    await db
      .update(users)
      .set({ sessionToken: null, updatedAt: new Date() })
      .where(eq(users.sessionToken, tokenHash));
  }
  return c.json({ success: true, data: { ok: true } });
});

// GET /api/v1/auth/swiggy — Start OAuth flow
app.get('/swiggy', (c) => {
  const pkce = generatePKCE();
  const url = buildAuthorizeUrl(pkce);

  pendingFlows.set(pkce.state, { codeVerifier: pkce.codeVerifier, state: pkce.state });
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

  const tokenRes = await exchangeCodeForToken(code, flow.codeVerifier);

  const swiggyIdHash = crypto.createHash('sha256').update(tokenRes.access_token).digest('hex');

  const db = getDb();
  const sessionToken = crypto.randomUUID();
  const tokenHash = hashSessionToken(sessionToken);
  const accessTokenEncrypted = encryptToken(tokenRes.access_token);

  const existing = await db.select().from(users).where(eq(users.swiggyIdHash, swiggyIdHash)).get();

  if (existing) {
    await db
      .update(users)
      .set({
        sessionToken: tokenHash,
        accessTokenEncrypted,
        tokenExpiry: new Date(Date.now() + tokenRes.expires_in * 1000),
        role: existing.role ?? 'user',
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({
      swiggyIdHash,
      sessionToken: tokenHash,
      accessTokenEncrypted,
      role: 'user',
      name: 'Swiggy User',
      tokenExpiry: new Date(Date.now() + tokenRes.expires_in * 1000),
    });
  }

  return c.json({
    success: true,
    data: {
      token: sessionToken,
      expiresIn: tokenRes.expires_in,
      role: 'user' as const,
      homePath: portalHomePath('user'),
    },
  });
});

export default app;
