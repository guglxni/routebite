import { INTERCEPT_SCORING, INTERCEPT_ALGORITHMS, INTERCEPT_TYPE_BONUS } from '@routebite/shared/constants';
import {
  compareInterceptRank,
  selectSpacedPoints,
  selectTopK,
} from '@routebite/shared/algorithms';
import type { CandidatePoint, ScoredInterceptPoint } from './types';

export function scoreInterceptPoint(point: CandidatePoint): number {
  const { SCORE_WEIGHTS } = INTERCEPT_SCORING;

  const dwellScore = Math.min(point.dwellTime / 180, 1) * SCORE_WEIGHTS.DWELL_TIME;
  const restaurantScore = Math.min((point.restaurantCount ?? 0) / 10, 1) * SCORE_WEIGHTS.RESTAURANT_DENSITY;
  const safetyScore = ((point.safetyRating ?? 3) / 5) * SCORE_WEIGHTS.SAFETY;
  const typeScore = INTERCEPT_TYPE_BONUS[point.type] ?? 0;

  return Math.round(dwellScore + restaurantScore + safetyScore + typeScore);
}

/**
 * Filter, rank, and greedily select well-spaced intercept points.
 *
 * - Small pools: full sort O(n log n)
 * - Large pools: heap top-k pre-filter O(n log k) then spacing
 * - Spacing: linear scan when n ≤ 100; geohash grid when n > 100
 */
export function filterAndRankPoints(
  points: ScoredInterceptPoint[],
  minScore: number = INTERCEPT_SCORING.MIN_SCORE,
  maxPoints: number = 5,
  intervalMeters: number = 500
): ScoredInterceptPoint[] {
  const filtered = points.filter((p) => p.score >= minScore);
  if (filtered.length === 0) return [];

  const poolSize = Math.max(maxPoints, maxPoints * INTERCEPT_ALGORITHMS.TOP_K_POOL_MULTIPLIER);

  const ranked =
    filtered.length > INTERCEPT_ALGORITHMS.TOP_K_HEAP_THRESHOLD
      ? selectTopK(filtered, poolSize, compareInterceptRank)
      : [...filtered].sort((a, b) => compareInterceptRank(b, a));

  return selectSpacedPoints(
    ranked,
    maxPoints,
    intervalMeters,
    INTERCEPT_ALGORITHMS.GEOHASH_SPATIAL_THRESHOLD
  );
}
