import type { LatLng } from '@routebite/shared/types';
import { haversineMeters } from '../../../lib/geo';
import { indexByKey } from '../../../lib/collections';
import type { NtesRunStationRow, NtesScheduleStationRow, TrainRunSnapshot, TrainStationStop } from './types';
import type { NtesLiveStatus, NtesSchedule, NtesTrainInfo } from './client';
import { parseDelayMinutes } from './parse';

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse NTES datetime like "18:49 04-Jun" or "Source" / "Destination". */
export function parseNtesDateTime(value: string | undefined, startDate: string, now = new Date()): Date | undefined {
  if (!value || value === 'Source' || value === 'Destination' || value === '**UA**') return undefined;

  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})-([A-Za-z]{3})/);
  if (m) {
    const year = inferYear(Number(m[3]), m[4], startDate, now);
    return new Date(year, MONTHS[m[4].toLowerCase()] ?? 0, Number(m[3]), Number(m[1]), Number(m[2]), 0);
  }

  const timeOnly = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const start = parseStartDate(startDate);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate(), Number(timeOnly[1]), Number(timeOnly[2]), 0);
  }

  return undefined;
}

function parseStartDate(startDate: string): Date {
  const m = startDate.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    return new Date(Number(m[3]), MONTHS[m[2].toLowerCase()] ?? 0, Number(m[1]));
  }
  return new Date();
}

function inferYear(day: number, mon: string, startDate: string, now: Date): number {
  const fromStart = parseStartDate(startDate).getFullYear();
  const month = MONTHS[mon.toLowerCase()] ?? 0;
  let year = fromStart;
  const candidate = new Date(year, month, day);
  if (candidate.getTime() < now.getTime() - 48 * 3600_000) year += 1;
  return year;
}

function haltFromSchedule(code: string, scheduleByCode: Map<string, NtesScheduleStationRow>): number {
  const row = scheduleByCode.get(code);
  if (!row?.Halt) return 120;
  return Math.max(60, row.Halt * 60);
}

function computeHaltFromRun(row: NtesRunStationRow, scheduleByCode: Map<string, NtesScheduleStationRow>, startDate: string): number {
  const code = row.SC ?? '';
  const sched = haltFromSchedule(code, scheduleByCode);
  const arr = parseNtesDateTime(row.ETA ?? row.STA, startDate);
  const dep = parseNtesDateTime(row.ETD ?? row.STD, startDate);
  if (arr && dep && dep > arr) {
    return Math.max(60, Math.round((dep.getTime() - arr.getTime()) / 1000));
  }
  return sched;
}

export function buildScheduleIndex(schedule: NtesSchedule): Map<string, NtesScheduleStationRow> {
  const map = new Map<string, NtesScheduleStationRow>();
  for (const row of schedule.stations ?? []) {
    if (row.StationCode) map.set(row.StationCode, row);
  }
  return map;
}

export function parseRunStations(
  rows: NtesRunStationRow[] | undefined,
  startDate: string,
  scheduleByCode: Map<string, NtesScheduleStationRow>,
  now = new Date()
): TrainStationStop[] {
  if (!rows?.length) return [];

  return rows.map((row, idx) => {
    const code = row.SC ?? `UNK${idx}`;
    const expectedDeparture = row.ETD ?? row.STD;
    const expectedArrival = row.ETA ?? row.STA;
    const depTime = parseNtesDateTime(expectedDeparture, startDate, now);
    const arrTime = parseNtesDateTime(expectedArrival, startDate, now);
    const passed = depTime ? depTime.getTime() < now.getTime() - 60_000 : false;
    const haltSeconds = computeHaltFromRun(row, scheduleByCode, startDate);
    const etaSeconds = depTime ? Math.max(0, Math.round((depTime.getTime() - now.getTime()) / 1000)) : undefined;

    return {
      stationCode: code,
      stationName: row.SN ?? code,
      sequence: Number(row.Sr ?? idx + 1),
      platform: row.PF || undefined,
      scheduledArrival: row.STA,
      scheduledDeparture: row.STD,
      expectedArrival,
      expectedDeparture,
      arrivalDelay: row.DARR || undefined,
      departureDelay: row.DDEP || undefined,
      haltSeconds,
      distanceKm: Number(row.DIST ?? 0),
      etaSeconds: passed ? undefined : etaSeconds,
      passed,
    };
  });
}

export function buildTrainRunSnapshot(
  trainNumber: string,
  info: NtesTrainInfo,
  live: NtesLiveStatus,
  schedule: NtesSchedule,
  startDate: string,
  fallbackUrl: string
): TrainRunSnapshot {
  const scheduleByCode = buildScheduleIndex(schedule);
  const stations = parseRunStations(live.STNS, startDate, scheduleByCode);
  const delayMinutes = parseDelayMinutes(String(live.LDEL ?? '')) ?? parseDelayMinutes(live.DDEP) ?? parseDelayMinutes(live.DARR);

  const currentStationCode = live.LSTN ?? live.CurrentStation;
  const currentStationName = live.LSTNN ?? live.CurrentStationName;
  const nextStationCode = live.NPSTN ?? live.NextStationCode;
  const nextStationName = live.NPSTNN ?? live.NextStationName;

  return {
    trainNumber,
    trainName: live.TNM ?? live.TrainName ?? info.TrainName ?? schedule.TrainName,
    startDate,
    sourceStation: live.SRC ?? schedule.Source,
    destinationStation: live.DSTN ?? schedule.Destination,
    delayMinutes,
    currentStationCode: currentStationCode || undefined,
    currentStationName: currentStationName || undefined,
    nextStationCode: nextStationCode || undefined,
    nextStationName: nextStationName || undefined,
    lastUpdate: live.LUPDFULL ?? live.LUPDT ?? live.LEVNT ?? live.LastUpdate,
    stations,
    updatedAt: new Date().toISOString(),
    source: 'ntes',
    fallbackUrl,
  };
}

/** Match user origin/destination to station window on the train route. */
export function selectStationWindow(
  stations: TrainStationStop[],
  origin: LatLng,
  destination: LatLng,
  geocoded: Map<string, LatLng>
): { fromIndex: number; toIndex: number } {
  if (stations.length === 0) return { fromIndex: 0, toIndex: 0 };

  let bestOriginIdx = 0;
  let bestOriginDist = Infinity;
  let bestDestIdx = stations.length - 1;
  let bestDestDist = Infinity;

  stations.forEach((s, i) => {
    const loc = geocoded.get(s.stationCode);
    if (!loc) return;
    const dOrigin = haversineMeters(origin, loc);
    const dDest = haversineMeters(destination, loc);
    if (dOrigin < bestOriginDist) {
      bestOriginDist = dOrigin;
      bestOriginIdx = i;
    }
    if (dDest < bestDestDist) {
      bestDestDist = dDest;
      bestDestIdx = i;
    }
  });

  if (bestOriginIdx > bestDestIdx) [bestOriginIdx, bestDestIdx] = [bestDestIdx, bestOriginIdx];
  return { fromIndex: bestOriginIdx, toIndex: Math.max(bestOriginIdx, bestDestIdx) };
}

export function buildStationIndex(stations: TrainStationStop[]): Map<string, TrainStationStop> {
  return indexByKey(stations, (s) => s.stationCode);
}

/** @deprecated Import haversineMeters from lib/geo */
export const haversineM = haversineMeters;

export function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    result += encodeSigned(lat - lastLat);
    result += encodeSigned(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return result;
}

function encodeSigned(num: number): string {
  let s = num << 1;
  if (num < 0) s = ~s;
  let out = '';
  while (s >= 0x20) {
    out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  out += String.fromCharCode(s + 63);
  return out;
}
