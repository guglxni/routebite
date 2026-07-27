import { describe, expect, test } from 'bun:test';
import {
  PlacesInsightsClient,
  fallbackRestaurantCount,
} from '../../src/services/maps/places';

/**
 * Aggregate requires ADC (agent-skills). Without ADC, client uses Nearby Search.
 * Unit tests run with NODE_ENV=test → getGoogleAccessToken() returns null.
 */
describe('PlacesInsightsClient', () => {
  test('deduplicates grid cells when batch counting (Nearby path without ADC)', async () => {
    const fetchCalls: string[] = [];
    const client = new PlacesInsightsClient({
      apiKey: 'test-key',
      fetchFn: async (input) => {
        fetchCalls.push(String(input));
        // Nearby Search shape
        return new Response(
          JSON.stringify({
            places: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}` })),
          }),
          { status: 200 }
        );
      },
    });

    const points = [
      { lat: 12.93521, lng: 77.62451 },
      { lat: 12.93529, lng: 77.62459 }, // same grid cell
      { lat: 12.94100, lng: 77.63000 }, // different grid cell
    ];

    const counts = await client.countRestaurantsForPoints(points);
    expect(fetchCalls.length).toBe(2);
    expect(counts.get('12.935,77.625')).toBe(7);
    expect(counts.get('12.941,77.630')).toBe(7);
  });

  test('uses Nearby Search when Aggregate ADC is unavailable', async () => {
    let call = 0;
    const client = new PlacesInsightsClient({
      apiKey: 'test-key',
      fetchFn: async () => {
        call += 1;
        return new Response(JSON.stringify({ places: [{ id: '1' }, { id: '2' }] }), {
          status: 200,
        });
      },
    });

    const count = await client.countRestaurantsNear({ lat: 12.93, lng: 77.62 });
    expect(count).toBe(2);
    // Only Nearby — Aggregate short-circuits without ADC
    expect(call).toBe(1);
  });

  test('falls back to heuristic when all Places APIs fail', async () => {
    const client = new PlacesInsightsClient({
      apiKey: 'test-key',
      fetchFn: async () => new Response('blocked', { status: 403 }),
    });

    const point = { lat: 13.0123, lng: 77.7123 };
    const count = await client.countRestaurantsNear(point);
    expect(count).toBe(fallbackRestaurantCount(point));
  });

  test('resolveCountForPoint uses grid map or fallback', () => {
    const client = new PlacesInsightsClient({ apiKey: 'test-key' });
    const point = { lat: 12.9352, lng: 77.6245 };
    const gridKey = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    const grid = new Map([[gridKey, 12]]);
    expect(client.resolveCountForPoint(point, grid)).toBe(12);
    expect(client.resolveCountForPoint({ lat: 13.0, lng: 77.7 }, grid)).toBe(
      fallbackRestaurantCount({ lat: 13.0, lng: 77.7 })
    );
  });
});

describe('fallbackRestaurantCount', () => {
  test('returns deterministic count between 1 and 15', () => {
    const point = { lat: 12.9716, lng: 77.5946 };
    const a = fallbackRestaurantCount(point);
    const b = fallbackRestaurantCount(point);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(15);
  });
});
