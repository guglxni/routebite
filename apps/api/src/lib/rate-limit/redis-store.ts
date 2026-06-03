import { RedisClient } from 'bun';
import type { RateLimitDecision, RateLimitStore } from './types';

/**
 * Distributed fixed-window counter backed by Redis INCR + EXPIRE.
 * Works across multiple API instances when REDIS_URL is configured.
 */
export class RedisRateLimitStore implements RateLimitStore {
  readonly backend = 'redis' as const;
  private client: RedisClient;

  constructor(redisUrl: string) {
    this.client = new RedisClient(redisUrl);
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const redisKey = `ratelimit:${key}`;
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    const count = Number(await this.client.incr(redisKey));
    if (count === 1) {
      await this.client.expire(redisKey, windowSeconds);
    }

    const ttlSeconds = Number(await this.client.ttl(redisKey));
    const resetAt = Date.now() + Math.max(ttlSeconds, 1) * 1000;
    const remaining = Math.max(0, limit - count);

    if (count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, ttlSeconds),
      };
    }

    return {
      allowed: true,
      limit,
      remaining,
      resetAt,
    };
  }
}
