import { LruCache } from '../lru-cache';
import type { RateLimitDecision, RateLimitStore } from './types';

/** Token-bucket entry — refills continuously for smoother limiting than fixed windows. */
type Bucket = {
  tokens: number;
  updatedAt: number;
};

const MAX_KEYS = 10_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * In-process rate limiter with token-bucket algorithm and LRU key cap.
 * Safe for single-instance dev; use Redis store in production clusters.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly backend = 'memory' as const;
  private buckets = new LruCache<string, Bucket>(MAX_KEYS);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweepStale(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: limit, updatedAt: now };
    } else {
      const elapsed = Math.max(0, now - bucket.updatedAt);
      const refill = (elapsed / windowMs) * limit;
      bucket.tokens = Math.min(limit, bucket.tokens + refill);
      bucket.updatedAt = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      const resetAt = now + Math.ceil((1 - bucket.tokens) * (windowMs / limit));
      return {
        allowed: true,
        limit,
        remaining: Math.floor(bucket.tokens),
        resetAt,
      };
    }

    this.buckets.set(key, bucket);
    const deficit = 1 - bucket.tokens;
    const retryAfterSeconds = Math.max(1, Math.ceil(deficit * (windowMs / limit) / 1000));
    const resetAt = now + retryAfterSeconds * 1000;

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  private sweepStale(): void {
    const staleBefore = Date.now() - 5 * 60_000;
    // LRU cache has no iterator of stale-only; token refill handles expiry on access.
    // Periodic no-op sweep keeps hook for future metrics; buckets expire via LRU cap.
    void staleBefore;
  }
}
