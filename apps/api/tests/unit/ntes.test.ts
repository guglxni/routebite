import { describe, expect, test } from 'bun:test';
import { buildNtesPayload, decodeNtesPayload } from '../../src/services/railways/ntes/crypto';
import { formatNtesDate, pickStartDate } from '../../src/services/railways/ntes/client';
import { parseDelayMinutes, parseLiveStatus } from '../../src/services/railways/ntes/parse';

describe('NTES crypto', () => {
  test('build + decode roundtrip', () => {
    const payload = 'service=TrainRunningMob&subService=GetTrainInstance&trainNo=12301';
    const built = buildNtesPayload(payload);
    expect(built).toContain('#');

    const [, encrypted] = built.split('#');
    const decoded = decodeNtesPayload(encrypted!);
    expect(decoded).toBe(payload);
  });

  test('build matches ntes-client reference ciphertext', () => {
    const payload = 'service=TrainRunningMob&subService=GetTrainInstance&trainNo=12301';
    const built = buildNtesPayload(payload);
    expect(built).toBe(
      '2C9F9F2314C19DF644B0975BB4E1425E#6430384136355152636A2B7345435539465A72522B37364E7358716157656E6F756C52516F4A616951377364385563693130492B4C6252624F7932666852557A4E4C32304B454F433170776F314D512B56676256514B5558576E717A496D52764D6C5579776B62636570673D'
    );
  });

  test('decode strips hash prefix when present', () => {
    const payload = 'service=TrainRunningMob&subService=FindTrainJson&trainNo=rajdhani';
    const built = buildNtesPayload(payload);
    const decoded = decodeNtesPayload(built);
    expect(decoded).toBe(payload);
  });
});

describe('NTES parse helpers', () => {
  test('parseDelayMinutes', () => {
    expect(parseDelayMinutes('On Time')).toBe(0);
    expect(parseDelayMinutes('Late by 12 Min')).toBe(12);
    expect(parseDelayMinutes('15 Min Late')).toBe(15);
    expect(parseDelayMinutes(undefined)).toBeUndefined();
  });

  test('formatNtesDate', () => {
    const d = new Date('2026-05-02T12:00:00');
    expect(formatNtesDate(d)).toBe('02-May-2026');
  });

  test('pickStartDate prefers running instance', () => {
    expect(
      pickStartDate({
        vInstanceList: [
          { trainStatus: 0, startDate: '01-May-2026' },
          { trainStatus: 1, startDate: '02-May-2026' },
        ],
      })
    ).toBe('02-May-2026');
  });

  test('parseLiveStatus maps NTES fields', () => {
    const parsed = parseLiveStatus(
      '12301',
      { TrainName: 'KOLKATA RAJDHANI' },
      {
        CurrentStation: 'CNB',
        CurrentStationName: 'KANPUR CENTRAL',
        LastUpdate: 'Train has departed from KANPUR CENTRAL',
        DelayDep: 'On Time',
        DDEP: 'On Time',
        Platform: '4',
        NextStationCode: 'ALD',
        NextStationName: 'ALLAHABAD JN',
      },
      '02-May-2026'
    );

    expect(parsed.trainName).toBe('KOLKATA RAJDHANI');
    expect(parsed.lastKnownStation).toBe('KANPUR CENTRAL (CNB)');
    expect(parsed.delayMinutes).toBe(0);
    expect(parsed.nextStation).toBe('ALLAHABAD JN (ALD)');
    expect(parsed.platform).toBe('4');
  });
});
