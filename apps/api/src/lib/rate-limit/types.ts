export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
};

export interface RateLimitStore {
  readonly backend: 'memory' | 'redis';
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
}
