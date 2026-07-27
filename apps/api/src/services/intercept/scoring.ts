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

  // Prefer true reachable density when isochrone PIP ran; fall back to circular count.
  const reachable = point.reachableRestaurantCount;
  const circular = point.restaurantCount ?? 0;
  const densityCount =
    typeof reachable === 'number' && point.reachability?.isochroneOk
      ? reachable
      : circular;
  const restaurantScore =
    Math.min(densityCount / 10, 1) * SCORE_WEIGHTS.RESTAURANT_DENSITY;

  // Reachability quality: fraction of circular supply that is network-reachable,
  // or absolute reachable count when we have no circular baseline.
  let reachabilityScore = 0;
  if (SCORE_WEIGHTS.REACHABILITY > 0) {
    if (typeof reachable === 'number' && point.reachability?.isochroneOk) {
      if (circular > 0) {
        reachabilityScore =
          Math.min(reachable / Math.max(circular, 1), 1) * SCORE_WEIGHTS.REACHABILITY;
      } else {
        reachabilityScore =
          Math.min(reachable / 8, 1) * SCORE_WEIGHTS.REACHABILITY;
      }
      // Empty reachable supply is a hard demotion signal
      if (reachable === 0) {
        reachabilityScore = 0;
      }
    } else {
      // No isochrone yet — partial credit from circular density so pre-enrich scores aren't zeroed
      reachabilityScore =
        Math.min(circular / 12, 1) * SCORE_WEIGHTS.REACHABILITY * 0.4;
    }
  }

  const safetyScore = ((point.safetyRating ?? 3) / 5) * SCORE_WEIGHTS.SAFETY;
  const typeScore = INTERCEPT_TYPE_BONUS[point.type] ?? 0;

  return Math.round(dwellScore + restaurantScore + reachabilityScore + safetyScore + typeScore);
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
  let filtered = points.filter((p) => p.score >= minScore);

  // Soft fallback: short / sparse routes often score just under MIN_SCORE after
  // isochrone enrichment. Still surface the best stops so the dashboard isn't empty.
  if (filtered.length === 0 && points.length > 0) {
    filtered = [...points]
      .sort((a, b) => compareInterceptRank(b, a))
      .slice(0, Math.max(1, Math.min(maxPoints, 3)));
  }
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
