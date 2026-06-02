import { describe, expect, test } from 'bun:test';
import { withGoogleRetry } from '../../src/services/maps/retry';

describe('withGoogleRetry', () => {
  test('retries on transient REQUEST_DENIED then succeeds', async () => {
    let attempts = 0;
    const result = await withGoogleRetry(async () => {
      attempts += 1;
      if (attempts < 2) throw new Error('Geocoding failed: REQUEST_DENIED');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('does not retry non-transient errors', async () => {
    let attempts = 0;
    await expect(
      withGoogleRetry(async () => {
        attempts += 1;
        throw new Error('No route found');
      })
    ).rejects.toThrow('No route found');
    expect(attempts).toBe(1);
  });
});
