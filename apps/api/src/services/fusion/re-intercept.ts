import type { AlignmentLevel } from '@routebite/shared/types';

export interface InterceptCandidate {
  id: string;
  name?: string | null;
  score: number;
  estimatedDwellTime?: number | null;
  restaurantCount?: number | null;
  reachableRestaurantCount?: number | null;
  etaSecondsFromNow?: number;
}

export interface ReInterceptSuggestion {
  shouldSwitch: boolean;
  reason: string;
  currentInterceptId: string;
  recommendedInterceptId: string | null;
  recommendedName: string | null;
  alignmentLevel?: AlignmentLevel;
  actions: Array<'flush_cart' | 'create_address' | 're_search' | 'stay'>;
}

/** When alignment is poor / rider far ahead, suggest next richer intercept. */
export function suggestReIntercept(opts: {
  currentInterceptId: string;
  alignmentLevel?: AlignmentLevel | null;
  riderOutsideIsochrone?: boolean;
  candidates: InterceptCandidate[];
}): ReInterceptSuggestion {
  const { currentInterceptId, alignmentLevel, riderOutsideIsochrone, candidates } = opts;
  const sorted = [...candidates]
    .filter((c) => c.id !== currentInterceptId)
    .sort((a, b) => {
      const ar = a.reachableRestaurantCount ?? a.restaurantCount ?? 0;
      const br = b.reachableRestaurantCount ?? b.restaurantCount ?? 0;
      if (br !== ar) return br - ar;
      return b.score - a.score;
    });

  const next = sorted[0] ?? null;
  const badAlign = alignmentLevel === 'poor' || alignmentLevel === 'fair';
  const shouldSwitch = Boolean(riderOutsideIsochrone || (badAlign && next));

  if (!shouldSwitch) {
    return {
      shouldSwitch: false,
      reason: 'Stay on current intercept — alignment and reachability look fine.',
      currentInterceptId,
      recommendedInterceptId: null,
      recommendedName: null,
      alignmentLevel: alignmentLevel ?? undefined,
      actions: ['stay'],
    };
  }

  return {
    shouldSwitch: true,
    reason: riderOutsideIsochrone
      ? 'Rider is outside the dwell isochrone — switch intercept and re-search catalog.'
      : `Alignment is ${alignmentLevel} — next stop may sync better.`,
    currentInterceptId,
    recommendedInterceptId: next?.id ?? null,
    recommendedName: next?.name ?? null,
    alignmentLevel: alignmentLevel ?? undefined,
    actions: next
      ? ['flush_cart', 'create_address', 're_search']
      : ['stay'],
  };
}
