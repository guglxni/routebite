import { MemoryRateLimitStore } from './memory-store';
import { RedisRateLimitStore } from './redis-store';
import type { RateLimitStore } from './types';

let store: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (store) return store;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    store = new RedisRateLimitStore(redisUrl);
    console.log('[rate-limit] Using Redis backend (distributed)');
  } else {
    store = new MemoryRateLimitStore();
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[rate-limit] REDIS_URL not set — using in-memory limiter (single-instance only). ' +
          'Set REDIS_URL for horizontal scaling.'
      );
    } else {
      console.log('[rate-limit] Using in-memory backend (dev)');
    }
  }

  return store;
}

/** Test hook — reset singleton between unit tests. */
export function resetRateLimitStoreForTests(): void {
  store = null;
}

export type { RateLimitDecision, RateLimitStore } from './types';
