import { describe, expect, test } from 'bun:test';
import { fromGoogleLatLng } from '../../src/services/maps/google-latlng';

describe('fromGoogleLatLng', () => {
  test('converts Google latitude/longitude to internal LatLng', () => {
    expect(fromGoogleLatLng({ latitude: 12.9352, longitude: 77.6245 })).toEqual({
      lat: 12.9352,
      lng: 77.6245,
    });
  });

  test('passes through existing LatLng', () => {
    const point = { lat: 12.93, lng: 77.62 };
    expect(fromGoogleLatLng(point)).toBe(point);
  });
});

describe('address validation verdict parsing', () => {
  test('treats geocoded locality as valid when addressComplete is absent', () => {
    const verdict = {
      inputGranularity: 'OTHER',
      validationGranularity: 'OTHER',
      geocodeGranularity: 'OTHER',
      hasUnconfirmedComponents: true,
      possibleNextAction: 'FIX',
    };
    const location = fromGoogleLatLng({ latitude: 12.9352403, longitude: 77.624532 });
    const hasGeocode = Number.isFinite(location.lat) && Number.isFinite(location.lng);
    const valid = (verdict as { addressComplete?: boolean }).addressComplete ?? hasGeocode;

    expect(valid).toBe(true);
    expect(location.lat).toBeCloseTo(12.935, 2);
  });
});
