import { describe, expect, test } from 'bun:test';
import { MemoryRateLimitStore } from '../../src/lib/rate-limit/memory-store';

describe('MemoryRateLimitStore', () => {
  test('allows requests under the limit', async () => {
    const store = new MemoryRateLimitStore();
    const first = await store.consume('test-ip', 3, 60_000);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
  });

  test('blocks when limit exceeded', async () => {
    const store = new MemoryRateLimitStore();
    const limit = 2;
    await store.consume('burst', limit, 60_000);
    await store.consume('burst', limit, 60_000);
    const blocked = await store.consume('burst', limit, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('isolates keys', async () => {
    const store = new MemoryRateLimitStore();
    await store.consume('a', 1, 60_000);
    const blockedA = await store.consume('a', 1, 60_000);
    const allowedB = await store.consume('b', 1, 60_000);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });
});

describe('logSecurityEvent shape', () => {
  test('emits parseable JSON', async () => {
    const { logSecurityEvent } = await import('../../src/lib/security-log');
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => lines.push(msg);

    logSecurityEvent({
      event: 'rate_limit.exceeded',
      requestId: 'req-1',
      ip: '127.0.0.1',
      statusCode: 429,
    });

    console.warn = original;
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.category).toBe('security');
    expect(parsed.event).toBe('rate_limit.exceeded');
    expect(parsed.requestId).toBe('req-1');
  });
});
