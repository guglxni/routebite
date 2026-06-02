import { describe, expect, test } from 'bun:test';
import { parseNtesDateTime, parseRunStations } from '../../src/services/railways/ntes/stations';

describe('NTES stations', () => {
  test('parseNtesDateTime parses live run timestamps', () => {
    const d = parseNtesDateTime('18:49 04-Jun', '04-Jun-2026', new Date('2026-06-04T12:00:00'));
    expect(d?.getHours()).toBe(18);
    expect(d?.getMinutes()).toBe(49);
  });

  test('parseRunStations computes halt and eta', () => {
    const scheduleByCode = new Map([
      ['CNB', { StationCode: 'CNB', Halt: 5 }],
    ]);
    const stops = parseRunStations(
      [
        {
          SC: 'CNB',
          SN: 'KANPUR CENTRAL',
          ETA: '04:45 05-Jun',
          ETD: '04:50 05-Jun',
          PF: '1',
          DDEP: 'On Time',
          DIST: 1008,
          Sr: '8',
        },
      ],
      '04-Jun-2026',
      scheduleByCode,
      new Date('2026-06-05T04:00:00')
    );

    expect(stops[0]?.stationCode).toBe('CNB');
    expect(stops[0]?.haltSeconds).toBeGreaterThanOrEqual(180);
    expect(stops[0]?.etaSeconds).toBeGreaterThan(0);
    expect(stops[0]?.passed).toBe(false);
  });
});
