import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { requestIdMiddleware } from './middleware/request-id';
import { accessLogMiddleware } from './middleware/access-log';
import { errorHandler } from './middleware/error-handler';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { authMiddleware } from './middleware/auth';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { structuredLogsEnabled } from './lib/security-log';
import healthRoutes from './routes/health';
import routeRoutes from './routes/routes';
import interceptRoutes from './routes/intercepts';
import orderRoutes from './routes/orders';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import railwaysRoutes from './routes/railways';
import { bootstrapPolling } from './services/tracking/poller';

const app = new Hono();

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

// Protected routes require Bearer token
app.use('/api/v1/routes/*', authMiddleware);
app.route('/api/v1/routes', routeRoutes);

app.use('/api/v1/intercepts/*', authMiddleware);
app.route('/api/v1/intercepts', interceptRoutes);

app.use('/api/v1/orders/*', authMiddleware);
app.route('/api/v1/orders', orderRoutes);

// Auth routes are public
app.route('/api/v1/auth', authRoutes);

app.use('/api/v1/user/*', authMiddleware);
app.route('/api/v1/user', userRoutes);

app.use('/api/v1/railways/*', authMiddleware);
app.route('/api/v1/railways', railwaysRoutes);

// ─── Error Handling ──────────────────────────────────────────────────────────

app.onError(errorHandler);

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.notFound((c) => {
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

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 RouteBite API running at http://localhost:${port}`);

// ─── Background Services ─────────────────────────────────────────────────────

bootstrapPolling(async (_userId) => {
  // In production: decrypt user's access token from DB.
  // For now polling is triggered on-demand via /track endpoints.
  return undefined;
}).catch((e) => console.error('[bootstrap] Tracking poller failed:', e));


