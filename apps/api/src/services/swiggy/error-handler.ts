import type { ClassifiedError, SwiggyErrorType } from './types';
import { RETRY_STRATEGY } from '@routebite/shared/constants';

/**
 * Classify an error from a Swiggy MCP call.
 */
export function classifyError(err: unknown, statusCode?: number): ClassifiedError {
  // Network / fetch errors
  if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
    return { type: 'network', retryable: true, message: err instanceof Error ? err.message : 'Network error' };
  }

  // HTTP status-based classification
  if (statusCode) {
    if (statusCode === 401) {
      return { type: 'auth', retryable: false, statusCode, message: 'Swiggy authentication required' };
    }
    if (statusCode === 429) {
      return { type: 'rate_limit', retryable: true, statusCode, message: 'Rate limited by Swiggy' };
    }
    if (statusCode >= 500) {
      return { type: 'server', retryable: true, statusCode, message: `Swiggy server error (${statusCode})` };
    }
    if (statusCode >= 400) {
      return { type: 'client', retryable: false, statusCode, message: `Bad request (${statusCode})` };
    }
  }

  // Check error message for known patterns
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('UNAUTHORIZED') || msg.includes('invalid_grant')) {
    return { type: 'auth', retryable: false, message: msg };
  }

  return { type: 'unknown', retryable: false, message: msg };
}

/**
 * Calculate retry delay with exponential backoff + jitter.
 */
export function getRetryDelay(attempt: number): number {
  const { BASE_DELAY_MS, MAX_DELAY_MS } = RETRY_STRATEGY;
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential; // 0–30% jitter
  return Math.min(exponential + jitter, MAX_DELAY_MS);
}

/**
 * Sleep utility.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
