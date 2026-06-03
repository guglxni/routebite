import type { Context } from 'hono';

/** Best-effort client IP for rate limiting and security logs. */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return c.req.header('CF-Connecting-IP') ?? 'unknown';
}
