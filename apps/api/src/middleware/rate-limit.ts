import { createMiddleware } from 'hono/factory';
import { RouteBiteError } from './error-handler';
import { RATE_LIMITS } from '@routebite/shared/constants';
import { clientIp } from '../lib/client-ip';
import { getRateLimitStore } from '../lib/rate-limit';
import { logSecurityEvent, requestLogContext, SecurityEvents } from '../lib/security-log';

const WINDOW_MS = 60_000;
const store = getRateLimitStore();

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const ip = clientIp(c);
  const key = `ip:${ip}`;

  const decision = await store.consume(key, RATE_LIMITS.API_PER_IP_PER_MIN, WINDOW_MS);

  c.header('X-RateLimit-Limit', String(decision.limit));
  c.header('X-RateLimit-Remaining', String(decision.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1000)));

  if (!decision.allowed) {
    logSecurityEvent({
      event: SecurityEvents.RATE_LIMIT,
      ...requestLogContext(c),
      statusCode: 429,
      detail: {
        limit: decision.limit,
        retryAfterSeconds: decision.retryAfterSeconds,
        backend: store.backend,
      },
    });

    throw new RouteBiteError(
      'RATE_LIMITED',
      `Rate limit exceeded: ${RATE_LIMITS.API_PER_IP_PER_MIN} requests per minute`,
      429,
      { retryAfter: decision.retryAfterSeconds ?? 60 }
    );
  }

  await next();
});
