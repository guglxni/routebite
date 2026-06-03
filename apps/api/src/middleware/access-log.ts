import { createMiddleware } from 'hono/factory';
import { logAccessEvent, requestLogContext, structuredLogsEnabled } from '../lib/security-log';

/**
 * Emits one JSON line per request in production (or when STRUCTURED_LOGS=1).
 * Complements security events with latency and status for observability pipelines.
 */
export const accessLogMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  if (!structuredLogsEnabled()) return;

  const ctx = requestLogContext(c);
  logAccessEvent({
    requestId: ctx.requestId,
    method: c.req.method,
    path: c.req.path,
    ip: ctx.ip ?? 'unknown',
    userId: ctx.userId,
    status: c.res.status,
    durationMs: Date.now() - start,
  });
});
