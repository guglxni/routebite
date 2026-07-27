import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { requestIdMiddleware } from './middleware/request-id';
import { accessLogMiddleware } from './middleware/access-log';
import { errorHandler } from './middleware/error-handler';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { authMiddleware } from './middleware/auth';
import { requireRoles } from './middleware/require-role';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { structuredLogsEnabled } from './lib/security-log';
import healthRoutes from './routes/health';
import routeRoutes from './routes/routes';
import interceptRoutes from './routes/intercepts';
import orderRoutes from './routes/orders';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import railwaysRoutes from './routes/railways';
import adminRoutes from './routes/admin';
import riderRoutes from './routes/rider';
import swiggyCommerceRoutes from './routes/swiggy-commerce';
import { bootstrapPolling } from './services/tracking/poller';
import { bootstrapDeferredPlacer } from './services/fusion/deferred-placer';
import { ensureFusionSchema } from './services/fusion/ensure-schema';

const app = new Hono();

/** Single-box MVP: API + Vite SPA from one process (no second container). */
const webDist = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.resolve(process.cwd(), '../../web/dist');
const serveWeb = process.env.SERVE_WEB === '1' && existsSync(path.join(webDist, 'index.html'));


// ─── Global Middleware ───────────────────────────────────────────────────────

app.use(requestIdMiddleware);
app.use(securityHeadersMiddleware);
if (!structuredLogsEnabled()) {
  app.use(logger());
}
app.use(accessLogMiddleware);
app.use(cors({
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(rateLimitMiddleware);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route('/', healthRoutes);

// Auth routes are public (login / portal / oauth)
app.route('/api/v1/auth', authRoutes);

// Traveler (user) APIs — isolated from rider/admin
app.use('/api/v1/routes/*', authMiddleware, requireRoles('user'));
app.route('/api/v1/routes', routeRoutes);

app.use('/api/v1/intercepts/*', authMiddleware, requireRoles('user'));
app.route('/api/v1/intercepts', interceptRoutes);

app.use('/api/v1/orders/*', authMiddleware, requireRoles('user'));
app.route('/api/v1/orders', orderRoutes);

app.use('/api/v1/swiggy/*', authMiddleware, requireRoles('user'));
app.route('/api/v1/swiggy', swiggyCommerceRoutes);

app.use('/api/v1/user/*', authMiddleware, requireRoles('user', 'rider', 'admin'));
app.route('/api/v1/user', userRoutes);

app.use('/api/v1/railways/*', authMiddleware, requireRoles('user'));
app.route('/api/v1/railways', railwaysRoutes);

// Rider APIs — isolated
app.use('/api/v1/rider/*', authMiddleware, requireRoles('rider'));
app.route('/api/v1/rider', riderRoutes);

// Admin APIs — isolated
app.use('/api/v1/admin/*', authMiddleware, requireRoles('admin'));
app.route('/api/v1/admin', adminRoutes);

// ─── Error Handling ──────────────────────────────────────────────────────────

app.onError(errorHandler);

// ─── Static web (optional MVP co-host) + 404 ─────────────────────────────────

if (serveWeb) {
  app.use('/*', serveStatic({ root: webDist }));
}

app.notFound(async (c) => {
  if (serveWeb && !c.req.path.startsWith('/api')) {
    try {
      const html = await readFile(path.join(webDist, 'index.html'), 'utf8');
      return c.html(html);
    } catch {
      /* fall through */
    }
  }
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${c.req.path} not found`,
      requestId: c.get('requestId'),
    },
  }, 404);
});


// ─── Start Server ────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '8787');

async function start() {
  const { ensurePortalSchema } = await import('./lib/portal-migrate');
  await ensurePortalSchema();
  await ensureFusionSchema();

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`🚀 RouteBite API running at http://localhost:${port}`);
  if (serveWeb) console.log(`📦 Serving web SPA from ${webDist}`);

  bootstrapDeferredPlacer();

  bootstrapPolling(async (_userId) => {
    // In production: decrypt user's access token from DB.
    // For now polling is triggered on-demand via /track endpoints.
    return undefined;
  }).catch((e) => console.error('[bootstrap] Tracking poller failed:', e));
}

start().catch((e) => {
  console.error('[boot] Failed to start API:', e);
  process.exit(1);
});


