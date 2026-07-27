import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { intercepts, journeys } from '@routebite/db/schema';
import { probeCorridorCoverage, type CorridorCoverage } from './corridor-coverage';
import { mealPrimingForInterceptEta } from './meal-priming';
import { evaluateHaltGate } from './halt-gate';

export interface CorridorStopSummary {
  interceptId: string;
  name: string | null;
  type: string;
  score: number;
  dwellSeconds: number;
  etaSeconds: number | null;
  coverage: CorridorCoverage | null;
  haltGate: ReturnType<typeof evaluateHaltGate> | null;
  mealHint: ReturnType<typeof mealPrimingForInterceptEta>;
  error?: string;
}

/** Probe Food+Instamart coverage along journey intercepts (corridor routing). */
export async function buildJourneyCorridor(opts: {
  journeyId: string;
  accessToken: string;
  userName?: string;
  limit?: number;
}): Promise<{
  journeyId: string;
  transportMode: string;
  stops: CorridorStopSummary[];
  probedAt: string;
}> {
  const db = getDb();
  const journey = await db.select().from(journeys).where(eq(journeys.id, opts.journeyId)).get();
  if (!journey) {
    return { journeyId: opts.journeyId, transportMode: 'car', stops: [], probedAt: new Date().toISOString() };
  }

  const points = await db
    .select()
    .from(intercepts)
    .where(eq(intercepts.journeyId, opts.journeyId))
    .all();

  const sorted = [...points].sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5);
  const stops: CorridorStopSummary[] = [];

  for (const point of sorted) {
    const dwell = point.estimatedDwellTime ?? 300;
    const mealHint = mealPrimingForInterceptEta(dwell, 'food');
    let coverage: CorridorCoverage | null = null;
    let error: string | undefined;
    try {
      coverage = await probeCorridorCoverage({
        interceptId: point.id,
        lat: point.lat,
        lng: point.lng,
        dwellSeconds: dwell,
        etaSeconds: dwell,
        restaurantCount: point.restaurantCount ?? undefined,
        accessToken: opts.accessToken,
        userName: opts.userName,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'coverage failed';
    }

    const haltGate = evaluateHaltGate({
      dwellSeconds: dwell,
      prepSeconds: 900,
      riderTravelSeconds: 600,
      transportMode: journey.transportMode,
    });

    stops.push({
      interceptId: point.id,
      name: point.name,
      type: point.type,
      score: point.score,
      dwellSeconds: dwell,
      etaSeconds: null,
      coverage,
      haltGate,
      mealHint,
      error,
    });
  }

  return {
    journeyId: opts.journeyId,
    transportMode: journey.transportMode,
    stops,
    probedAt: new Date().toISOString(),
  };
}
