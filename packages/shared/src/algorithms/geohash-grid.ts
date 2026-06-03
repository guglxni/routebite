import { haversineMeters, metersToLatitudeDegrees, type GeoPoint } from './geo';

type StoredPoint = GeoPoint & { id?: string };

/**
 * Geohash-style spatial grid for O(1) cell lookup + neighbor pruning.
 * Avoids O(n²) pairwise distance checks when deduplicating or spacing large candidate sets.
 *
 * Cell width ≈ `cellSizeMeters` (latitude degrees; adequate for India latitudes at ≤500 m cells).
 */
export class GeohashSpatialIndex {
  private cells = new Map<string, StoredPoint[]>();
  private readonly cellDeg: number;

  constructor(cellSizeMeters: number) {
    this.cellDeg = Math.max(metersToLatitudeDegrees(cellSizeMeters), 1e-6);
  }

  private cellKey(lat: number, lng: number): string {
    const row = Math.floor(lat / this.cellDeg);
    const col = Math.floor(lng / this.cellDeg);
    return `${row},${col}`;
  }

  private neighborKeys(lat: number, lng: number): string[] {
    const row = Math.floor(lat / this.cellDeg);
    const col = Math.floor(lng / this.cellDeg);
    const keys: string[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        keys.push(`${row + dr},${col + dc}`);
      }
    }
    return keys;
  }

  /** True if any indexed point lies within `radiusMeters` of (lat, lng). */
  hasWithin(lat: number, lng: number, radiusMeters: number): boolean {
    for (const key of this.neighborKeys(lat, lng)) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      for (const p of bucket) {
        if (haversineMeters(p, { lat, lng }) < radiusMeters) return true;
      }
    }
    return false;
  }

  add(lat: number, lng: number, id?: string): void {
    const key = this.cellKey(lat, lng);
    const bucket = this.cells.get(key);
    const point: StoredPoint = { lat, lng, id };
    if (bucket) bucket.push(point);
    else this.cells.set(key, [point]);
  }

  get size(): number {
    let n = 0;
    for (const bucket of this.cells.values()) n += bucket.length;
    return n;
  }
}

/**
 * Greedily pick up to `maxPoints` items that are at least `intervalMeters` apart.
 * Uses geohash grid when `items.length` exceeds `spatialThreshold`.
 */
export function selectSpacedPoints<T extends GeoPoint>(
  items: readonly T[],
  maxPoints: number,
  intervalMeters: number,
  spatialThreshold = 100
): T[] {
  const useGrid = items.length > spatialThreshold;
  const grid = useGrid ? new GeohashSpatialIndex(intervalMeters) : null;
  const result: T[] = [];

  for (const item of items) {
    const tooClose = grid
      ? grid.hasWithin(item.lat, item.lng, intervalMeters)
      : result.some((r) => haversineMeters(r, item) < intervalMeters);

    if (!tooClose) {
      result.push(item);
      grid?.add(item.lat, item.lng);
      if (result.length >= maxPoints) break;
    }
  }

  return result;
}
