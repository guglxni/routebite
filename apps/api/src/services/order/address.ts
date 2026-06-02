import type { LatLng } from '@routebite/shared/types';
import { mapsClient } from '../maps/client';
import type { GeneratedAddress } from './types';

/**
 * Generate a formatted delivery address from an intercept point.
 * Uses reverse geocoding + a label based on nearby landmarks.
 */
export async function generateInterceptAddress(point: LatLng): Promise<GeneratedAddress> {
  try {
    const formatted = await mapsClient.reverseGeocode(point.lat, point.lng);
    const label = deriveLabelFromAddress(formatted);

    return {
      formatted,
      label,
      lat: point.lat,
      lng: point.lng,
    };
  } catch {
    // Fallback: use coordinates as address
    return {
      formatted: `Near ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      label: 'Delivery Point',
      lat: point.lat,
      lng: point.lng,
    };
  }
}

function deriveLabelFromAddress(address: string): string {
  const lower = address.toLowerCase();

  if (lower.includes('metro') || lower.includes('station')) return 'Metro Station';
  if (lower.includes('bus') || lower.includes('depot')) return 'Bus Stop';
  if (lower.includes('toll')) return 'Toll Plaza';
  if (lower.includes('petrol') || lower.includes('fuel')) return 'Petrol Pump';
  if (lower.includes('signal') || lower.includes('red light')) return 'Traffic Signal';

  return 'Route Point';
}
