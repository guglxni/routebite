import { describe, expect, test } from 'bun:test';
import { riderTransportMode } from '@routebite/shared/constants';
import {
  TRANSPORT_MODE_MAP,
  googleTravelModeFor,
} from '../../src/services/maps/constants';

describe('TWO_WHEELER rider mapping', () => {
  test('food rider mode is bike → TWO_WHEELER', () => {
    expect(riderTransportMode('food')).toBe('bike');
    expect(TRANSPORT_MODE_MAP.bike.travelMode).toBe('TWO_WHEELER');
    expect(googleTravelModeFor('bike')).toBe('TWO_WHEELER');
  });

  test('instamart may use car → DRIVE', () => {
    expect(riderTransportMode('instamart')).toBe('car');
    expect(googleTravelModeFor('car')).toBe('DRIVE');
  });

  test('bike uses traffic-aware routing preference', () => {
    expect(TRANSPORT_MODE_MAP.bike.routingPreference).toBe('TRAFFIC_AWARE_OPTIMAL');
  });
});
