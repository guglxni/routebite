interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * LRU cache with per-entry TTL — O(1) get/set, bounded memory.
 * Used for Maps API responses, NTES snapshots, and other expiring data.
 */
export class TtlLruCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();

  constructor(
    private maxSize: number,
    private defaultTtlMs: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh recency (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
