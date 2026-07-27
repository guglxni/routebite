import { describe, expect, test } from 'bun:test';
import { ISOCHRONE, TIMING } from '@routebite/shared/constants';
import { computeRiderBudgetSeconds } from '../../src/services/maps/isochrones';
import { IsochronesClient } from '../../src/services/maps/isochrones';

describe('computeRiderBudgetSeconds', () => {
  test('clamps to min when dwell is short', () => {
    const budget = computeRiderBudgetSeconds(5 * 60, {
      prepReserveS: ISOCHRONE.PREP_RESERVE_S,
      safetyBufferS: TIMING.SAFETY_BUFFER_S,
      trafficBufferS: TIMING.TRAFFIC_BUFFER_S,
    });
    expect(budget).toBe(ISOCHRONE.RIDER_MIN_BUDGET_S);
  });

  test('grows with longer dwell and applies bike buffer', () => {
    // dwell 45 min → raw = 45*60 - 12*60 - 10*60 - 5*60 = 18*60 = 1080
    // buffered ≈ 1080 * 1.12 ≈ 1210, under max 25*60=1500
    const budget = computeRiderBudgetSeconds(45 * 60);
    expect(budget).toBeGreaterThan(ISOCHRONE.RIDER_MIN_BUDGET_S);
    expect(budget).toBeLessThanOrEqual(ISOCHRONE.RIDER_MAX_BUDGET_S);
    expect(budget).toBe(Math.round(1080 * ISOCHRONE.BIKE_BUFFER_RATIO));
  });

  test('caps at RIDER_MAX_BUDGET_S', () => {
    const budget = computeRiderBudgetSeconds(3 * 60 * 60);
    expect(budget).toBe(ISOCHRONE.RIDER_MAX_BUDGET_S);
  });
});

describe('IsochronesClient', () => {
  test('parses successful generate response and caches', async () => {
    let calls = 0;
    const geoJson = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [
          [
            [77.0, 28.0],
            [77.1, 28.0],
            [77.1, 28.1],
            [77.0, 28.1],
            [77.0, 28.0],
          ],
        ],
      ],
    };

    const fetchFn = (async () => {
      calls++;
      return new Response(JSON.stringify({ isochrone: { geoJson } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const client = new IsochronesClient('test-key', fetchFn);
    const a = await client.generate({
      location: { lat: 28.05, lng: 77.05 },
      travelDurationSeconds: 600,
      travelMode: 'BICYCLE',
      travelDirection: 'TO',
      enableSmoothing: false,
    });
    const b = await client.generate({
      location: { lat: 28.05, lng: 77.05 },
      travelDurationSeconds: 600,
      travelMode: 'BICYCLE',
      travelDirection: 'TO',
      enableSmoothing: false,
    });

    expect(a.geometry.type).toBe('MultiPolygon');
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    expect(calls).toBe(1);
  });
});
