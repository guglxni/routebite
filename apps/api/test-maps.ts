import { mapsClient } from './src/services/maps/client';
import { weatherClient } from './src/services/weather/client';

const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const WHITEFIELD = { lat: 12.9698, lng: 77.7499 };

type CheckResult = { name: string; ok: boolean; detail: string };

async function runCheck(name: string, fn: () => Promise<string>): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (err) {
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return { name, ok: false, detail };
  }
}

async function test() {
  console.log('=== RouteBite Google Maps Smoke Test ===\n');

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY is not set. Add it to apps/api/.env');
    process.exit(1);
  }

  const results: CheckResult[] = [];

  results.push(
    await runCheck('Address Validation', async () => {
      const valid = await mapsClient.validateAddress('Koramangala, Bengaluru');
      return `valid=${valid.valid} formatted=${valid.formattedAddress}`;
    })
  );

  results.push(
    await runCheck('Geocoding', async () => {
      const geo = await mapsClient.geocode('Koramangala, Bengaluru');
      return `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`;
    })
  );

  results.push(
    await runCheck('Routes (traffic + extras)', async () => {
    const route = await mapsClient.computeRoute(KORAMANGALA, WHITEFIELD, 'car', {
      extraComputations: true,
    });
      return `${route.distanceMeters}m / ${route.durationSeconds}s / tolls=${route.hasTolls ?? false}`;
    })
  );

  results.push(
    await runCheck('Route Matrix', async () => {
      const matrix = await mapsClient.computeRouteMatrix([KORAMANGALA], [WHITEFIELD], 'bike');
      return `duration=${matrix.durations[0]?.[0]}s distance=${matrix.distances[0]?.[0]}m`;
    })
  );

  results.push(
    await runCheck('Roads (snapToRoads)', async () => {
      const snapped = await mapsClient.snapToRoads([KORAMANGALA, WHITEFIELD]);
      return `${snapped.length} snapped points`;
    })
  );

  results.push(
    await runCheck('Places (restaurant count)', async () => {
      const count = await mapsClient.countRestaurantsNear(KORAMANGALA, 500);
      return `count=${count} (live API or heuristic fallback)`;
    })
  );

  results.push(
    await runCheck('Weather', async () => {
      const wx = await weatherClient.getContextForPoint(KORAMANGALA);
      return `penalty=${wx.safetyPenalty} buffer=${wx.timingBufferSeconds}s alert=${wx.alerts?.hasActiveAlert ?? false}`;
    })
  );

  console.log('Results:\n');
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
    console.log(`  ${r.detail}\n`);
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`=== ${passed}/${results.length} checks passed ===`);

  if (passed < results.length) {
    process.exit(1);
  }

  if (passed === 0) {
    console.log('\nEnable required APIs in Google Cloud Console:');
    console.log('- Geocoding API, Routes API, Route Matrix API');
    console.log('- Places API (New), Area Insights API');
    console.log('- Roads API, Address Validation API');
    console.log('- Weather API (already working if Weather check passed)');
    process.exit(1);
  }
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
