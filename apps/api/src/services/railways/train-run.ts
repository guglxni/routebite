/**
 * Full NTES train run: schedule + live station trajectory.
 */
import { NtesClient, pickStartDate } from './ntes/client';
import { NTESError } from './ntes/exceptions';
import { ntesFallbackUrl, parseLiveStatus } from './ntes/parse';
import { buildTrainRunSnapshot } from './ntes/stations';
import type { TrainRunSnapshot } from './ntes/types';
import type { ParsedTrainLiveStatus } from './ntes/parse';

export type TrainRunResult = ParsedTrainLiveStatus & {
  run: TrainRunSnapshot;
  source: 'ntes' | 'unavailable';
  fallbackUrl: string;
  note?: string;
};

const CACHE_TTL_MS = 45_000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, { expiresAt: number; value: TrainRunResult }>();

let client: NtesClient | null = null;

function getClient(): NtesClient {
  if (!client) {
    client = new NtesClient({
      timeoutMs: Number(process.env.NTES_TIMEOUT_MS ?? 12_000),
      retries: Number(process.env.NTES_RETRIES ?? 2),
    });
  }
  return client;
}

export async function getTrainRun(trainNumber: string): Promise<TrainRunResult> {
  if (!/^\d{5}$/.test(trainNumber)) {
    throw new Error('Train number must be exactly 5 digits');
  }

  const fallbackUrl = ntesFallbackUrl(trainNumber);
  const cached = cache.get(trainNumber);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const ntes = getClient();
    const info = await ntes.trainInfo(trainNumber);
    const startDate = pickStartDate(info);
    const [live, schedule] = await Promise.all([
      ntes.liveStatus(trainNumber, startDate),
      ntes.schedule(trainNumber, startDate),
    ]);

    const parsed = parseLiveStatus(trainNumber, info, live, startDate);
    const run = buildTrainRunSnapshot(trainNumber, info, live, schedule, startDate, fallbackUrl);

    const result: TrainRunResult = {
      ...parsed,
      run,
      source: 'ntes',
      fallbackUrl,
    };

    cache.set(trainNumber, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return result;
  } catch (err) {
    const message = err instanceof NTESError ? err.message : (err as Error).message;
    console.warn(`[railways] NTES run failed for ${trainNumber}:`, message);

    return {
      trainNumber,
      run: {
        trainNumber,
        startDate: '',
        stations: [],
        updatedAt: new Date().toISOString(),
        source: 'unavailable',
        fallbackUrl,
      },
      source: 'unavailable',
      fallbackUrl,
      note: `NTES run failed: ${message}`,
    };
  }
}

export function clearTrainRunCache(): void {
  cache.clear();
}
