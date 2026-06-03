import { describe, expect, test } from 'bun:test';
import { TtlLruCache } from '../../src/lib/ttl-lru-cache';

describe('TtlLruCache', () => {
  test('returns value before TTL expires', () => {
    const cache = new TtlLruCache<string, number>(10, 60_000);
    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  test('evicts oldest when max size exceeded', () => {
    const cache = new TtlLruCache<string, number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  test('expires entries after TTL', async () => {
    const cache = new TtlLruCache<string, number>(10, 20);
    cache.set('x', 99);
    await Bun.sleep(30);
    expect(cache.get('x')).toBeUndefined();
  });
});
