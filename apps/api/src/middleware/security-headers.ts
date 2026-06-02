import { createMiddleware } from 'hono/factory';

/**
 * Security headers middleware — OWASP A02 mitigation.
 * Equivalent to helmet() for Hono.
 */
export const securityHeadersMiddleware = createMiddleware(async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Strict-Transport-Security (only in production / HTTPS)
  if (c.req.header('X-Forwarded-Proto') === 'https' || process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // Content-Security-Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  c.header('Content-Security-Policy', csp);

  await next();
});
