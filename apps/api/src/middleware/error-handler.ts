import type { Context } from 'hono';
import { logSecurityEvent, SecurityEvents } from '../lib/security-log';
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export class RouteBiteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RouteBiteError';
  }
}

export function errorHandler(err: Error, c: Context): Response {
  const requestId = c.get('requestId') ?? 'unknown';

  if (err instanceof RouteBiteError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    };
    return c.json(body, err.statusCode as any);
  }

  // Validation errors (Zod)
  if (err.name === 'ZodError') {
    logSecurityEvent({
      event: SecurityEvents.VALIDATION_FAILED,
      requestId,
      method: c.req.method,
      path: c.req.path,
      statusCode: 400,
      detail: { issueCount: (err as { issues?: unknown[] }).issues?.length },
    });
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { issues: (err as any).issues },
        requestId,
      },
    };
    return c.json(body, 400 as any);
  }

  // Swiggy MCP errors
  if (err.message?.includes('UNAUTHORIZED') || err.message?.includes('401')) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Swiggy authentication required. Please re-authenticate.',
        requestId,
      },
    };
    return c.json(body, 401 as any);
  }

  // Generic fallback
  console.error(`[${requestId}] Unhandled error:`, err);
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  };
  return c.json(body, 500 as any);
}
