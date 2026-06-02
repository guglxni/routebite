/**
 * Live Indian Railways train status — thin wrapper over full NTES run.
 */
import { getTrainRun } from './train-run';
import type { ParsedTrainLiveStatus } from './ntes/parse';

export type TrainLiveStatus = ParsedTrainLiveStatus & {
  source: 'ntes' | 'unavailable';
  fallbackUrl: string;
  note?: string;
};

export async function getTrainLiveStatus(trainNumber: string): Promise<TrainLiveStatus> {
  const result = await getTrainRun(trainNumber);
  const { run, ...summary } = result;
  return {
    trainNumber: summary.trainNumber,
    trainName: summary.trainName,
    lastKnownStation: summary.lastKnownStation,
    lastEventAt: summary.lastEventAt,
    delayMinutes: summary.delayMinutes,
    status: summary.status,
    currentStationCode: summary.currentStationCode,
    nextStation: summary.nextStation,
    platform: summary.platform,
    startDate: summary.startDate,
    source: summary.source,
    fallbackUrl: summary.fallbackUrl,
    note: summary.note,
  };
}

export { clearTrainRunCache as clearTrainStatusCache } from './train-run';
