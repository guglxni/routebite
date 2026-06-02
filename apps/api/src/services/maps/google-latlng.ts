import type { LatLng } from '@routebite/shared/types';

/** Google Routes/Matrix/Places APIs use latitude/longitude, not lat/lng */
export interface GoogleLatLng {
  latitude: number;
  longitude: number;
}

export function toGoogleLatLng(point: LatLng): GoogleLatLng {
  return { latitude: point.lat, longitude: point.lng };
}

export function fromGoogleLatLng(point: GoogleLatLng | LatLng): LatLng {
  if ('lat' in point && 'lng' in point) return point;
  return { lat: point.latitude, lng: point.longitude };
}
