import { MinHeap } from './heap';

/**
 * Select the k best items from an unsorted array using a binary heap.
 * `better(a, b)` returns positive when `a` outranks `b`.
 *
 * Complexity: O(n log k) time, O(k) space — better than full sort O(n log n) when k << n.
 */
export function selectTopK<T>(items: readonly T[], k: number, better: (a: T, b: T) => number): T[] {
  if (k <= 0 || items.length === 0) return [];
  if (items.length <= k) {
    return [...items].sort((a, b) => better(b, a));
  }

  const heap = new MinHeap<T>(better);

  for (const item of items) {
    if (heap.size < k) {
      heap.push(item);
      continue;
    }
    const worst = heap.peek();
    if (worst !== undefined && better(item, worst) > 0) {
      heap.pop();
      heap.push(item);
    }
  }

  return heap.toArray().sort((a, b) => better(b, a));
}

/** Compare intercept-like objects by score desc, then customerETA asc. */
export function compareInterceptRank(
  a: { score: number; customerETA?: number },
  b: { score: number; customerETA?: number }
): number {
  if (a.score !== b.score) return a.score - b.score;
  return (b.customerETA ?? 0) - (a.customerETA ?? 0);
}
