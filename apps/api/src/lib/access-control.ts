import type { Context } from 'hono';
import { RouteBiteError } from '../middleware/error-handler';
import { logSecurityEvent, requestLogContext, SecurityEvents } from '../lib/security-log';

type AccessDeniedOpts = {
  resource: 'order' | 'intercept' | 'journey';
  resourceId: string;
  ownerUserId?: number | null;
};

/** Log IDOR attempt and throw opaque 404 (prevents resource enumeration). */
export function denyAccess(c: Context, opts: AccessDeniedOpts): never {
  logSecurityEvent({
    event: SecurityEvents.ACCESS_DENIED,
    ...requestLogContext(c),
    statusCode: 404,
    detail: {
      resource: opts.resource,
      resourceId: opts.resourceId,
      ...(opts.ownerUserId !== undefined ? { ownerUserId: opts.ownerUserId } : {}),
    },
  });
  throw new RouteBiteError('NOT_FOUND', `${capitalize(opts.resource)} not found`, 404);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
