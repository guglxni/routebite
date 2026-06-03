/**
 * Build train journey route + delivery intercepts from NTES schedule/live run.
 */
import type { LatLng } from '@routebite/shared/types';
import { INTERCEPT_SCORING } from '@routebite/shared/constants';
import { mapsClient } from '../maps/client';
import { scoreInterceptPoint, filterAndRankPoints } from '../intercept/scoring';
import type { ScoredInterceptPoint } from '../intercept/types';
import { getTrainRun } from './train-run';
import {
  buildStationIndex,
  encodePolyline,
  haversineM,
  selectStationWindow,
} from './ntes/stations';
import { parseStationCodeFromLabel } from './ntes/station-code';
import type { TrainStationStop, TrainRunSnapshot } from './ntes/types';

const MIN_HALT_SECONDS = 3 * 60;

export type TrainJourneyPlan = {
  routePoints: LatLng[];
  encodedPolyline: string;
  durationSeconds: number;
  distanceMeters: number;
  interceptPoints: ScoredInterceptPoint[];
  trainRun: TrainRunSnapshot;
};

async function geocodeStation(stop: TrainStationStop): Promise<LatLng | undefined> {
  const query = `${stop.stationName} ${stop.stationCode} railway station India`;
  try {
    return await mapsClient.geocode(query);
  } catch {
    return undefined;
  }
}

export async function buildTrainJourneyPlan(opts: {
  trainNumber: string;
  origin: LatLng;
  destination: LatLng;
}): Promise<TrainJourneyPlan> {
  const runResult = await getTrainRun(opts.trainNumber);
  const trainRun = runResult.run;

  if (trainRun.stations.length === 0) {
    throw new Error(runResult.note ?? 'NTES returned no station data for this train');
  }

  const geocoded = new Map<string, LatLng>();
  for (const stop of trainRun.stations) {
    const loc = await geocodeStation(stop);
    if (loc) geocoded.set(stop.stationCode, loc);
  }

  const { fromIndex, toIndex } = selectStationWindow(
    trainRun.stations,
    opts.origin,
    opts.destination,
    geocoded
  );

  const windowStations = trainRun.stations.slice(fromIndex, toIndex + 1);
  const routePoints = windowStations
    .map(s => geocoded.get(s.stationCode))
    .filter((p): p is LatLng => !!p);

  if (routePoints.length < 2) {
    throw new Error('Could not geocode enough stations on this train route for your journey');
  }

  let distanceMeters = 0;
  for (let i = 1; i < routePoints.length; i++) {
    distanceMeters += haversineM(routePoints[i - 1], routePoints[i]);
  }

  const firstStop = windowStations[0];
  const lastStop = windowStations[windowStations.length - 1];
  const durationSeconds =
    lastStop?.etaSeconds != null && firstStop?.etaSeconds != null
      ? Math.max(lastStop.etaSeconds - firstStop.etaSeconds, trainRun.stations[toIndex]?.etaSeconds ?? 3600)
      : Math.round(distanceMeters / 20_000 * 3600);

  const eligibleStops = windowStations.filter(
    (stop) => !stop.passed && stop.haltSeconds >= MIN_HALT_SECONDS && geocoded.has(stop.stationCode)
  );
  const eligibleLocs = eligibleStops.map((stop) => geocoded.get(stop.stationCode)!);

  let restaurantCounts = new Map<string, number>();
  try {
    restaurantCounts = await mapsClient.countRestaurantsForPoints(eligibleLocs, 800);
  } catch {
    // heuristic fallback per stop below
  }

  const candidates: ScoredInterceptPoint[] = [];

  for (const stop of eligibleStops) {
    const loc = geocoded.get(stop.stationCode)!;
    const restaurantCount = mapsClient.resolveRestaurantCount(loc, restaurantCounts);

    const distFromStart = routePoints.length > 0
      ? haversineM(routePoints[0], loc)
      : stop.distanceKm * 1000;

    const point = {
      lat: loc.lat,
      lng: loc.lng,
      type: 'stop' as const,
      dwellTime: stop.haltSeconds,
      distanceFromStart: distFromStart,
      restaurantCount,
      safetyRating: 4.5,
      name: `${stop.stationName} (${stop.stationCode})`,
      stopName: stop.stationName,
    };

    candidates.push({
      ...point,
      score: scoreInterceptPoint(point) + (stop.platform ? 5 : 0),
      customerETA: stop.etaSeconds ?? Math.round(distFromStart / 25_000 * 3600),
    });
  }

  const interceptPoints = filterAndRankPoints(
    candidates,
    INTERCEPT_SCORING.MIN_SCORE,
    5,
    20_000
  );

  return {
    routePoints,
    encodedPolyline: encodePolyline(routePoints),
    durationSeconds,
    distanceMeters: Math.round(distanceMeters),
    interceptPoints,
    trainRun,
  };
}

/** Resolve live ETA seconds for an intercept at a railway station — O(1) with index. */
export function etaForStationIntercept(
  trainRun: TrainRunSnapshot,
  interceptName?: string | null,
  stationIndex?: Map<string, TrainStationStop>
): number | undefined {
  const code = parseStationCodeFromLabel(interceptName);
  if (!code) return undefined;
  const index = stationIndex ?? buildStationIndex(trainRun.stations);
  return index.get(code)?.etaSeconds;
}
