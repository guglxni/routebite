import { describe, expect, test } from 'bun:test';
import { mapsClient } from '../../src/services/maps/client';
import { weatherClient } from '../../src/services/weather/client';
import { enrichCandidates } from '../../src/services/intercept/enrichment';
import { INDIRANAGAR, KORAMANGALA, WHITEFIELD, isMapsIntegrationEnabled } from '../helpers/maps-api';

const describeIntegration = isMapsIntegrationEnabled() ? describe : describe.skip;

describeIntegration('Google Maps integration (live API)', () => {
  test('geocodes Bengaluru locality', async () => {
    const point = await mapsClient.geocode('Koramangala, Bengaluru');
    expect(point.lat).toBeGreaterThan(12);
    expect(point.lat).toBeLessThan(13);
    expect(point.lng).toBeGreaterThan(77);
    expect(point.lng).toBeLessThan(78);
  }, 30_000);

  test('validates address and returns lat/lng location', async () => {
    const result = await mapsClient.validateAddress('Koramangala, Bengaluru');
    expect(result.valid).toBe(true);
    expect(result.formattedAddress).toContain('Koramangala');
    expect(result.location.lat).toBeGreaterThan(12);
    expect(result.location.lng).toBeGreaterThan(77);
  }, 30_000);

  test('computes traffic-aware route with extra computations', async () => {
    const route = await mapsClient.computeRoute(KORAMANGALA, WHITEFIELD, 'car', {
      extraComputations: true,
    });

    expect(route.distanceMeters).toBeGreaterThan(5000);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(route.polylinePoints.length).toBeGreaterThan(2);
    expect(route.steps.length).toBeGreaterThan(0);
    expect(route.steps[0].endLocation.latLng.lat).toBeGreaterThan(12);
  }, 45_000);

  test('counts restaurants near Koramangala (API or heuristic fallback)', async () => {
    const count = await mapsClient.countRestaurantsNear(KORAMANGALA);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(20);
  }, 30_000);

  test('returns weather context for intercept point', async () => {
    const ctx = await weatherClient.getContextForPoint(KORAMANGALA);
    expect(ctx).toHaveProperty('safetyPenalty');
    expect(ctx).toHaveProperty('timingBufferSeconds');
  }, 30_000);

  test('enriches intercept candidates end-to-end', async () => {
    const route = await mapsClient.computeRoute(KORAMANGALA, INDIRANAGAR, 'car');
    const mid = route.polylinePoints[Math.floor(route.polylinePoints.length / 2)]!;

    const enriched = await enrichCandidates(
      [
        {
          lat: mid.lat,
          lng: mid.lng,
          type: 'dynamic',
          dwellTime: 180,
          distanceFromStart: route.distanceMeters / 2,
          safetyRating: 3,
          restaurantCount: 1,
        },
      ],
      { transportMode: 'car', route }
    );

    expect(enriched).toHaveLength(1);
    expect(enriched[0].restaurantCount).toBeGreaterThanOrEqual(1);
    expect(enriched[0].safetyRating).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
