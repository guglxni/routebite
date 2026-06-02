import { describe, expect, test } from 'bun:test';
import {
  adjustDwellForTraffic,
  detectTollCandidatesFromRoute,
} from '../../src/services/intercept/traffic';
import type { JourneyRoute } from '../../src/services/maps/types';

const baseRoute: JourneyRoute = {
  polylinePoints: [
    { lat: 12.93, lng: 77.62 },
    { lat: 12.94, lng: 77.63 },
    { lat: 12.95, lng: 77.64 },
  ],
  encodedPolyline: 'mock',
  distanceMeters: 5000,
  durationSeconds: 600,
  steps: [
    {
      distanceMeters: 2500,
      staticDuration: '300s',
      polyline: { encodedPolyline: 'a' },
      startLocation: { latLng: { lat: 12.93, lng: 77.62 } },
      endLocation: { latLng: { lat: 12.94, lng: 77.63 } },
      travelMode: 'DRIVE',
      navigationInstruction: { maneuver: '', instructions: 'Continue straight' },
    },
    {
      distanceMeters: 2500,
      staticDuration: '300s',
      polyline: { encodedPolyline: 'b' },
      startLocation: { latLng: { lat: 12.94, lng: 77.63 } },
      endLocation: { latLng: { lat: 12.95, lng: 77.64 } },
      travelMode: 'DRIVE',
      navigationInstruction: { maneuver: '', instructions: 'Pass through toll plaza' },
    },
  ],
  hasTolls: true,
  travelAdvisory: {
    speedReadingIntervals: [
      { startPolylinePointIndex: 0, endPolylinePointIndex: 1, speed: 'TRAFFIC_JAM' },
    ],
    tollInfo: { estimatedPrice: [] },
  },
};

describe('adjustDwellForTraffic', () => {
  test('increases dwell time near traffic jam segments', () => {
    const baseDwell = 60;
    const adjusted = adjustDwellForTraffic(
      {
        lat: 12.935,
        lng: 77.625,
        type: 'traffic_light',
        dwellTime: baseDwell,
        distanceFromStart: 1000,
      },
      baseRoute
    );
    expect(adjusted).toBeGreaterThan(baseDwell);
  });

  test('returns original dwell when no traffic advisory', () => {
    const dwell = 120;
    const adjusted = adjustDwellForTraffic(
      {
        lat: 12.935,
        lng: 77.625,
        type: 'dynamic',
        dwellTime: dwell,
        distanceFromStart: 1000,
      },
      { ...baseRoute, travelAdvisory: undefined }
    );
    expect(adjusted).toBe(dwell);
  });
});

describe('detectTollCandidatesFromRoute', () => {
  test('detects toll plaza from step instructions', () => {
    const tolls = detectTollCandidatesFromRoute(baseRoute);
    expect(tolls.length).toBe(1);
    expect(tolls[0].type).toBe('toll_plaza');
  });

  test('returns empty when route has no toll signals', () => {
    const tolls = detectTollCandidatesFromRoute({
      ...baseRoute,
      hasTolls: false,
      travelAdvisory: undefined,
      steps: baseRoute.steps.map(s => ({
        ...s,
        navigationInstruction: { maneuver: '', instructions: 'Turn left' },
      })),
    });
    expect(tolls).toHaveLength(0);
  });
});
