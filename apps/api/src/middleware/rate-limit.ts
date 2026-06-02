import { createMiddleware } from 'hono/factory';
import { RouteBiteError } from './error-handler';
import { RATE_LIMITS } from '@routebite/shared/constants';

// Simple in-memory rate limiter keyed by IP (use Redis in production)
const ipStore = new Map<string, { count: number; resetAt: number }>();

function getWindowKey(): number {
  return Math.floor(Date.now() / 60000); // 1-minute window
}

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const ip = c.req.header('X-Forwarded-For') ?? c.req.header('CF-Connecting-IP') ?? 'unknown';
  const now = Date.now();
  const key = `${ip}:${getWindowKey()}`;

  const record = ipStore.get(key);
  if (record) {
    if (record.resetAt > now) {
      if (record.count >= RATE_LIMITS.API_PER_IP_PER_MIN) {
        throw new RouteBiteError(
          'RATE_LIMITED',
          `Rate limit exceeded: ${RATE_LIMITS.API_PER_IP_PER_MIN} requests per minute`,
          429,
          { retryAfter: Math.ceil((record.resetAt - now) / 1000) }
        );
      }
      record.count++;
    } else {
      ipStore.set(key, { count: 1, resetAt: now + 60000 });
    }
  } else {
    ipStore.set(key, { count: 1, resetAt: now + 60000 });
  }

  await next();
});
