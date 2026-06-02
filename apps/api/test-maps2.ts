import { mapsClient } from './src/services/maps/client';

async function test() {
  console.log('=== Testing Google Maps APIs (Round 2) ===\n');
  
  // Test with raw lat/lng instead of geocoding (since geocoding is denied)
  console.log('1. Route Computation (with lat/lng)');
  try {
    const route = await mapsClient.computeRoute(
      { lat: 12.9352, lng: 77.6245 },  // Koramangala
      { lat: 12.9698, lng: 77.7500 },  // Whitefield
      'car'
    );
    console.log('✅ SUCCESS');
    console.log('Distance:', route.distanceMeters, 'm');
    console.log('Duration:', route.durationSeconds, 's');
    console.log('Steps:', route.steps.length);
    if (route.steps.length > 0) {
      console.log('First step:', route.steps[0].navigationInstruction?.maneuver || 'N/A');
    }
  } catch (e) {
    console.error('❌ Route Computation FAILED:', e);
  }
  console.log('');
  
  // 2. Test Route Matrix (Distance Matrix v2)
  console.log('2. Route Matrix');
  try {
    const matrix = await mapsClient.computeRouteMatrix(
      [{ lat: 12.9352, lng: 77.6245 }],
      [{ lat: 12.9698, lng: 77.7500 }],
      'bike'
    );
    console.log('✅ SUCCESS');
    console.log('Result:', JSON.stringify(matrix, null, 2));
  } catch (e) {
    console.error('❌ Route Matrix FAILED:', e);
  }
  console.log('');

  // 3. Test Roads API
  console.log('3. Roads API (snapToRoads)');
  try {
    const snapped = await mapsClient.snapToRoads([
      { lat: 12.9352, lng: 77.6245 },
      { lat: 12.9698, lng: 77.7500 }
    ]);
    console.log('✅ SUCCESS');
    console.log('Result:', JSON.stringify(snapped, null, 2));
  } catch (e) {
    console.error('❌ Roads API FAILED:', e);
  }
}

test().catch(console.error);
