import { INTERCEPT_SCORING, INTERCEPT_TYPE_BONUS } from '@routebite/shared/constants';
import type { CandidatePoint, ScoredInterceptPoint } from './types';

export function scoreInterceptPoint(point: CandidatePoint): number {
  const { SCORE_WEIGHTS } = INTERCEPT_SCORING;

  // Dwell time score: ideal 3 minutes (180s), max at 10+ minutes
  const dwellScore = Math.min(point.dwellTime / 180, 1) * SCORE_WEIGHTS.DWELL_TIME;

  // Restaurant density: up to 10 restaurants for max score
  const restaurantScore = Math.min((point.restaurantCount ?? 0) / 10, 1) * SCORE_WEIGHTS.RESTAURANT_DENSITY;

  // Safety: 5-star scale
  const safetyScore = ((point.safetyRating ?? 3) / 5) * SCORE_WEIGHTS.SAFETY;

  // Type bonus (bus stop > traffic light > petrol pump > toll plaza > dynamic)
  const typeScore = INTERCEPT_TYPE_BONUS[point.type] ?? 0;

  return Math.round(dwellScore + restaurantScore + safetyScore + typeScore);
}

export function filterAndRankPoints(
  points: ScoredInterceptPoint[],
  minScore: number = INTERCEPT_SCORING.MIN_SCORE,
  maxPoints: number = 5,
  intervalMeters: number = 500
): ScoredInterceptPoint[] {
  // Filter by minimum score
  let filtered = points.filter(p => p.score >= minScore);

  // Sort by score descending, then by ETA alignment (min abs diff)
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.customerETA - b.customerETA;
  });

  // Enforce minimum spacing: pick top-scoring points at least intervalMeters apart
  const result: ScoredInterceptPoint[] = [];
  for (const point of filtered) {
    const tooClose = result.some(
      r => distanceBetween(r, point) < intervalMeters
    );
    if (!tooClose) {
      result.push(point);
      if (result.length >= maxPoints) break;
    }
  }

  return result;
}

function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLambda = ((b.lng - a.lng) * Math.PI) / 180;

  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(deltaLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
