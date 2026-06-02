import type { NtesLiveStatus, NtesTrainInfo } from './client';

export type ParsedTrainLiveStatus = {
  trainNumber: string;
  trainName?: string;
  lastKnownStation?: string;
  lastEventAt?: string;
  delayMinutes?: number;
  status?: string;
  currentStationCode?: string;
  nextStation?: string;
  platform?: string;
  startDate?: string;
};

const NTES_BASE = 'https://enquiry.indianrail.gov.in/mntes';

export function ntesFallbackUrl(trainNumber: string): string {
  return `${NTES_BASE}/?trainNo=${trainNumber}`;
}

/** Parse delay strings like "Late by 12 Min", "12 Min Late", "On Time", or numeric LDEL. */
export function parseDelayMinutes(delayText?: string | number): number | undefined {
  if (delayText === undefined || delayText === null || delayText === '') return undefined;
  if (typeof delayText === 'number') return delayText;
  const normalized = delayText.trim().toLowerCase();
  if (!normalized || normalized.includes('on time') || normalized === '0') return 0;
  const match = normalized.match(/(\d+)\s*(?:min|minute|mins)/);
  if (match) return Number(match[1]);
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function parseLiveStatus(
  trainNumber: string,
  info: NtesTrainInfo,
  live: NtesLiveStatus,
  startDate: string
): ParsedTrainLiveStatus {
  const trainName = live.TNM ?? live.TrainName ?? info.TrainName;
  const stationCode = live.LSTN ?? live.CurrentStation;
  const stationName = live.LSTNN ?? live.CurrentStationName;
  const lastKnownStation =
    stationName && stationCode
      ? `${stationName} (${stationCode})`
      : stationName ?? stationCode ?? undefined;

  const delayMinutes =
    parseDelayMinutes(live.LDEL) ??
    parseDelayMinutes(live.DDEP) ??
    parseDelayMinutes(live.DARR) ??
    parseDelayMinutes(live.LastUpdate);

  const lastUpdate = live.LUPDFULL ?? live.LUPDT ?? live.LEVNT ?? live.LastUpdate;
  let status = lastUpdate;
  if (!status && delayMinutes != null) {
    status = delayMinutes > 0 ? `Running late by ${delayMinutes} minutes` : 'Running on time';
  }

  const nextCode = live.NPSTN ?? live.NextStationCode;
  const nextName = live.NPSTNN ?? live.NextStationName;
  const nextStation =
    nextName && nextCode ? `${nextName} (${nextCode})` : nextName ?? nextCode;

  return {
    trainNumber,
    trainName,
    lastKnownStation,
    lastEventAt: lastUpdate,
    delayMinutes,
    status,
    currentStationCode: stationCode,
    nextStation,
    platform: live.PF ?? live.Platform,
    startDate: live.StartDate ?? startDate,
  };
}
