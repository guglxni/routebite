import { describe, expect, test } from 'bun:test';
import { parseStationCodeFromLabel } from '../../src/services/railways/ntes/station-code';

describe('parseStationCodeFromLabel', () => {
  test('extracts code from intercept label', () => {
    expect(parseStationCodeFromLabel('KANPUR CENTRAL (CNB)')).toBe('CNB');
  });

  test('returns undefined for missing label', () => {
    expect(parseStationCodeFromLabel(undefined)).toBeUndefined();
    expect(parseStationCodeFromLabel('Platform 3')).toBeUndefined();
  });
});
