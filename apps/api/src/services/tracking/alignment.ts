import type {
  AlignmentStatus,
  AlignmentLevel,
  OrderStatus,
  LatLng,
  InterceptReachability,
} from '@routebite/shared/types';
import { MAPS_FEATURES } from '@routebite/shared/constants';
import { isPointInsideRiderIsochrone } from '../maps/reachability';

export interface AlignmentInput {
  customerETA: number;   // seconds until customer reaches intercept
  riderETA: number;      // seconds until rider reaches intercept
  orderStatus: OrderStatus;
  prepTime?: number;     // seconds (estimated preparation time)
  /** Live rider position — checked against dwell isochrone when available. */
  riderPosition?: LatLng;
  reachability?: InterceptReachability | null;
  /** When customer ETA < rider budget, zone is shrinking — flag spatial risk. */
  riderOutsideIsochrone?: boolean;
}

const ALIGNMENT_THRESHOLDS: Record<AlignmentLevel, { min: number; max: number }> = {
  excellent: { min: -120, max: 120 },     // within 2 min
  good: { min: -300, max: 300 },          // within 5 min
  fair: { min: -600, max: 600 },          // within 10 min
  poor: { min: -Infinity, max: Infinity },
};

function computeAlignmentLevel(deltaSeconds: number): AlignmentLevel {
  const abs = Math.abs(deltaSeconds);
  if (abs <= 120) return 'excellent';
  if (abs <= 300) return 'good';
  if (abs <= 600) return 'fair';
  return 'poor';
}

function levelToColor(level: AlignmentLevel): string {
  switch (level) {
    case 'excellent': return '#10B981'; // emerald-500
    case 'good': return '#0EA5E9';      // sky-500
    case 'fair': return '#F59E0B';      // amber-500
    case 'poor': return '#EF4444';      // rose-500
  }
}

function levelToRecommendation(level: AlignmentLevel, delta: number): string | undefined {
  switch (level) {
    case 'excellent':
      return 'Perfect sync! Your food and ride will arrive together.';
    case 'good':
      return delta > 0
        ? 'Rider is slightly ahead. Slow down a bit if you want them to align.'
        : 'You are slightly ahead. The rider should catch up soon.';
    case 'fair':
      return delta > 0
        ? 'Rider may arrive before you. Consider a brief stop.'
        : 'You may arrive before the rider. Perfect for a quick stretch!';
    case 'poor':
      return delta > 0
        ? 'Rider is far ahead. Order may wait unattended.'
        : 'Rider is far behind. You may need to wait at the intercept.';
  }
}

/**
 * Compute alignment status between customer journey and rider delivery.
 *
 * Delta = customerETA - riderETA
 * - Positive: customer arrives AFTER rider (rider waiting)
 * - Negative: customer arrives BEFORE rider (customer waiting)
 * - Near 0: perfect sync
 */
export function computeAlignment(input: AlignmentInput): AlignmentStatus & {
  score: number;
  riderOutsideIsochrone?: boolean;
} {
  const { customerETA, riderETA } = input;
  const delta = customerETA - riderETA;
  let level = computeAlignmentLevel(delta);

  // Score: 0-100 normalized against fair threshold
  const abs = Math.abs(delta);
  let score = Math.max(0, Math.min(100, Math.round(100 - (abs / 600) * 100)));

  const orderReadyTime = Math.max(0, riderETA - (input.prepTime ?? 0));

  let riderOutsideIsochrone = input.riderOutsideIsochrone;
  if (
    riderOutsideIsochrone === undefined &&
    MAPS_FEATURES.ISOCHRONE_TRACKING &&
    input.riderPosition &&
    input.reachability
  ) {
    const inside = isPointInsideRiderIsochrone(input.riderPosition, input.reachability);
    if (inside === false) riderOutsideIsochrone = true;
  }

  let recommendation = levelToRecommendation(level, delta);
  if (riderOutsideIsochrone) {
    // Spatial miss demotes alignment
    if (level === 'excellent' || level === 'good') level = 'fair';
    score = Math.min(score, 55);
    recommendation =
      'Rider is outside the intercept reachability zone — delivery may miss your stop window.';
  }

  return {
    status: level,
    color: levelToColor(level),
    customerETA,
    riderETA,
    orderReadyTime,
    recommendation,
    score,
    riderOutsideIsochrone,
  };
}

/**
 * Compute a normalized alignment score (0-1) for database storage.
 */
export function computeAlignmentScore(input: AlignmentInput): number {
  return computeAlignment(input).score / 100;
}
