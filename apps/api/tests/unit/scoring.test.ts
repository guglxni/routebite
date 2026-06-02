import { describe, expect, test } from 'bun:test';
import { scoreInterceptPoint, filterAndRankPoints } from '../../src/services/intercept/scoring';
import type { ScoredInterceptPoint } from '../../src/services/intercept/types';
import { INTERCEPT_SCORING } from '@routebite/shared/constants';

describe('scoreInterceptPoint', () => {
  test('scores high for strong intercept candidates', () => {
    const score = scoreInterceptPoint({
      lat: 12.93,
      lng: 77.62,
      type: 'stop',
      dwellTime: 300,
      distanceFromStart: 5000,
      restaurantCount: 12,
      safetyRating: 5,
    });
    expect(score).toBeGreaterThanOrEqual(INTERCEPT_SCORING.MIN_SCORE);
  });

  test('scores low for weak candidates', () => {
    const score = scoreInterceptPoint({
      lat: 12.93,
      lng: 77.62,
      type: 'dynamic',
      dwellTime: 60,
      distanceFromStart: 5000,
      restaurantCount: 0,
      safetyRating: 2,
    });
    expect(score).toBeLessThan(INTERCEPT_SCORING.MIN_SCORE);
  });
});

describe('filterAndRankPoints', () => {
  const makePoint = (score: number, lat: number, lng: number, eta: number): ScoredInterceptPoint => ({
    lat,
    lng,
    type: 'dynamic',
    dwellTime: 180,
    distanceFromStart: eta * 10,
    score,
    customerETA: eta,
  });

  test('filters by minimum score and enforces spacing', () => {
    const points = [
      makePoint(90, 12.93, 77.62, 100),
      makePoint(85, 12.9301, 77.6201, 110), // too close
      makePoint(80, 12.95, 77.64, 200),
    ];

    const result = filterAndRankPoints(points, 60, 5, 500);
    expect(result).toHaveLength(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });
});
