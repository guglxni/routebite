import { describe, expect, test } from 'bun:test';
import {
  GeohashSpatialIndex,
  compareInterceptRank,
  haversineMeters,
  selectSpacedPoints,
  selectTopK,
} from '@routebite/shared/algorithms';
import { INTERCEPT_ALGORITHMS } from '@routebite/shared/constants';

describe('selectTopK', () => {
  test('returns k highest scores', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ score: i, customerETA: 0 }));
    const top = selectTopK(items, 5, compareInterceptRank);
    expect(top).toHaveLength(5);
    expect(top[0]!.score).toBe(99);
    expect(top[4]!.score).toBe(95);
  });

  test('matches full sort for small arrays', () => {
    const items = [
      { score: 70, customerETA: 100 },
      { score: 90, customerETA: 200 },
      { score: 80, customerETA: 50 },
    ];
    const top = selectTopK(items, 3, compareInterceptRank);
    expect(top.map((x) => x.score)).toEqual([90, 80, 70]);
  });
});

describe('GeohashSpatialIndex', () => {
  test('detects points within radius', () => {
    const grid = new GeohashSpatialIndex(500);
    grid.add(12.97, 77.59);
    expect(grid.hasWithin(12.9701, 77.5901, 500)).toBe(true);
    expect(grid.hasWithin(13.5, 78.0, 500)).toBe(false);
  });

  test('selectSpacedPoints uses grid above threshold', () => {
    const dense = Array.from({ length: 120 }, (_, i) => ({
      lat: 12.97 + i * 0.00001,
      lng: 77.59,
      score: 100 - i,
      customerETA: i,
    }));
    const ranked = selectTopK(dense, dense.length, compareInterceptRank);
    const spaced = selectSpacedPoints(
      ranked,
      5,
      500,
      INTERCEPT_ALGORITHMS.GEOHASH_SPATIAL_THRESHOLD
    );
    expect(spaced.length).toBeGreaterThan(0);
    expect(spaced.length).toBeLessThanOrEqual(5);
    for (let i = 0; i < spaced.length; i++) {
      for (let j = i + 1; j < spaced.length; j++) {
        expect(haversineMeters(spaced[i]!, spaced[j]!)).toBeGreaterThanOrEqual(500);
      }
    }
  });
});

describe('compareInterceptRank', () => {
  test('prefers higher score then lower ETA', () => {
    expect(compareInterceptRank({ score: 90, customerETA: 100 }, { score: 80, customerETA: 50 })).toBeGreaterThan(0);
    expect(compareInterceptRank({ score: 80, customerETA: 50 }, { score: 80, customerETA: 100 })).toBeGreaterThan(0);
  });
});
