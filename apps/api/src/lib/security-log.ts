import type { Context } from 'hono';
import { clientIp } from './client-ip';

export const SecurityEvents = {
  AUTH_MISSING: 'auth.missing_token',
  AUTH_INVALID: 'auth.invalid_session',
  AUTH_EXPIRED: 'auth.expired_token',
  AUTH_FAILED: 'auth.failed',
  RATE_LIMIT: 'rate_limit.exceeded',
  ACCESS_DENIED: 'access.denied',
  VALIDATION_FAILED: 'validation.failed',
} as const;

export type SecurityEventName = (typeof SecurityEvents)[keyof typeof SecurityEvents];

export type SecurityLogPayload = {
  event: SecurityEventName;
  requestId: string;
  method?: string;
  path?: string;
  ip?: string;
  userId?: number;
  statusCode?: number;
  detail?: Record<string, unknown>;
};

export function requestLogContext(c: Context): Pick<
  SecurityLogPayload,
  'requestId' | 'method' | 'path' | 'ip' | 'userId'
> {
  return {
    requestId: c.get('requestId') ?? 'unknown',
    method: c.req.method,
    path: c.req.path,
    ip: clientIp(c),
    userId: c.get('user')?.id,
  };
}

/** Structured JSON security event — suitable for log drains (Datadog, CloudWatch, etc.). */
export function logSecurityEvent(payload: SecurityLogPayload): void {
  const line = JSON.stringify({
    severity: 'WARNING',
    category: 'security',
    timestamp: new Date().toISOString(),
    ...payload,
  });
  console.warn(line);
}

export type AccessLogPayload = {
  requestId: string;
  method: string;
  path: string;
  ip: string;
  userId?: number;
  status: number;
  durationMs: number;
};

/** Structured JSON access log for production request tracing. */
export function logAccessEvent(payload: AccessLogPayload): void {
  const line = JSON.stringify({
    severity: 'INFO',
    category: 'access',
    timestamp: new Date().toISOString(),
    ...payload,
  });
  console.log(line);
}

export function structuredLogsEnabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGS === '1';
}
