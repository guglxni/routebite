import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'node:crypto';

/**
 * Attach X-Request-ID to every request for distributed tracing.
 * Reuses client-provided ID if present, otherwise generates a new UUID.
 */
export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
});

// Type declaration for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}
