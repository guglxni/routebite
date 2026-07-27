import { createMiddleware } from 'hono/factory';
import type { PortalRole } from '@routebite/shared/types';
import { RouteBiteError } from './error-handler';
import { logSecurityEvent, requestLogContext, SecurityEvents } from '../lib/security-log';

/** Require one of the listed portal roles after authMiddleware. */
export function requireRoles(...allowed: PortalRole[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!user?.role || !allowed.includes(user.role)) {
      logSecurityEvent({
        event: SecurityEvents.ACCESS_DENIED,
        ...requestLogContext(c),
        statusCode: 403,
        userId: user?.id,
        detail: { required: allowed, actual: user?.role ?? null },
      });
      throw new RouteBiteError(
        'FORBIDDEN',
        `This area requires role: ${allowed.join(' or ')}`,
        403
      );
    }
    await next();
  });
}
