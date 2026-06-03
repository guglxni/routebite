import { describe, expect, test } from 'bun:test';
import { haversineMeters, toGridKey } from '../../src/lib/geo';
import { indexByKey } from '../../src/lib/collections';
import { buildStationIndex } from '../../src/services/railways/ntes/stations';
import type { TrainStationStop } from '../../src/services/railways/ntes/types';

describe('haversineMeters', () => {
  test('returns ~0 for identical points', () => {
    const p = { lat: 12.97, lng: 77.59 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  test('matches known Bengaluru–Mumbai order of magnitude', () => {
    const blr = { lat: 12.9716, lng: 77.5946 };
    const mum = { lat: 19.076, lng: 72.8777 };
    const d = haversineMeters(blr, mum);
    expect(d).toBeGreaterThan(800_000);
    expect(d).toBeLessThan(900_000);
  });
});

describe('toGridKey', () => {
  test('quantizes to fixed precision', () => {
    expect(toGridKey(12.97159, 77.59463, 3)).toBe('12.972,77.595');
  });
});

describe('indexByKey / buildStationIndex', () => {
  test('builds O(1) lookup by station code', () => {
    const stops: TrainStationStop[] = [
      {
        stationCode: 'NDLS',
        stationName: 'New Delhi',
        sequence: 1,
        haltSeconds: 300,
        distanceKm: 0,
        passed: false,
      },
      {
        stationCode: 'CNB',
        stationName: 'Kanpur',
        sequence: 2,
        haltSeconds: 180,
        distanceKm: 440,
        etaSeconds: 7200,
        passed: false,
      },
    ];

    const index = buildStationIndex(stops);
    expect(index.get('CNB')?.etaSeconds).toBe(7200);
    expect(indexByKey(stops, (s) => s.stationCode).size).toBe(2);
  });
});
