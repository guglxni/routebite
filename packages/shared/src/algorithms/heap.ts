/** Binary min-heap — O(log n) push/pop, used for streaming top-k selection. */
export class MinHeap<T> {
  private data: T[] = [];

  /** Return positive when `a` is strictly better (higher priority) than `b`. */
  constructor(private readonly better: (a: T, b: T) => number) {}

  get size(): number {
    return this.data.length;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  push(value: T): void {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  /** Drain heap into an array (unordered). */
  toArray(): T[] {
    return [...this.data];
  }

  private less(a: T, b: T): boolean {
    return this.better(b, a) > 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(this.data[index], this.data[parent])) break;
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const n = this.data.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < n && this.less(this.data[left], this.data[smallest])) smallest = left;
      if (right < n && this.less(this.data[right], this.data[smallest])) smallest = right;
      if (smallest === index) break;

      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}
