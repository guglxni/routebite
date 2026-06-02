import { describe, expect, test } from 'bun:test';
import { getTrainLiveStatus } from '../../src/services/railways/tracker';

const RUN_NTES = process.env.RUN_NTES_INTEGRATION === '1';
const describeNTES = RUN_NTES ? describe : describe.skip;

describeNTES('NTES live integration', () => {
  test('fetches live status for Rajdhani 12301', async () => {
    const status = await getTrainLiveStatus('12301');
    expect(status.trainNumber).toBe('12301');
    expect(['ntes', 'unavailable']).toContain(status.source);
    if (status.source === 'ntes') {
      expect(status.fallbackUrl).toContain('12301');
      expect(status.trainName || status.lastKnownStation || status.status).toBeTruthy();
    }
  }, 30_000);
});
