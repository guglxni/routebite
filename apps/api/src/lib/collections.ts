/** Build a Map index from an array in O(n) for O(1) lookups. */
export function indexByKey<T, K extends string | number>(
  items: readonly T[],
  keyFn: (item: T) => K
): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return map;
}
