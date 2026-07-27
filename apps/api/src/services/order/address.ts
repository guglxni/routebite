import type { LatLng } from '@routebite/shared/types';
import { mapsClient } from '../maps/client';
import type { GeneratedAddress } from './types';
import type { CreateAddressArgs } from '../swiggy/schemas';

/**
 * Generate a formatted delivery address from an intercept point.
 * Uses reverse geocoding + a label based on nearby landmarks.
 */
export async function generateInterceptAddress(point: LatLng): Promise<GeneratedAddress> {
  try {
    const formatted = await mapsClient.reverseGeocode(point.lat, point.lng);
    const label = deriveLabelFromAddress(formatted);
    const parsed = parseIndianAddress(formatted);

    return {
      formatted,
      label,
      lat: point.lat,
      lng: point.lng,
      ...parsed,
    };
  } catch {
    return {
      formatted: `Near ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      label: 'Delivery Point',
      lat: point.lat,
      lng: point.lng,
      addressLine: `Near ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      addressLine2: '',
      city: 'Bengaluru',
      postalCode: '560001',
      locality: undefined,
    };
  }
}

/**
 * Map an intercept address into Instamart `create_address` args
 * (https://mcp.swiggy.com/builders/docs/reference/instamart/create_address.md).
 */
export function toCreateAddressArgs(
  address: GeneratedAddress,
  opts: {
    userName: string;
    userPhone: string;
    landmark?: string;
    addressCategory?: CreateAddressArgs['addressCategory'];
  }
): CreateAddressArgs {
  const line2 = [address.addressLine2, opts.landmark].filter(Boolean).join(' · ') || '';
  return {
    fullAddress: address.formatted,
    addressLine: address.addressLine || address.formatted,
    addressLine2: line2,
    locality: address.locality,
    city: address.city || 'Bengaluru',
    postalCode: address.postalCode || '560001',
    latitude: address.lat,
    longitude: address.lng,
    addressCategory: opts.addressCategory ?? 'OTHER',
    addressTag: address.label,
    userName: opts.userName,
    userPhone: opts.userPhone,
  };
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

/** Best-effort parse of Google-style Indian reverse-geocode strings. */
export function parseIndianAddress(formatted: string): {
  addressLine: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  locality?: string;
} {
  const postalMatch = formatted.match(/\b(\d{6})\b/);
  const postalCode = postalMatch?.[1] ?? '560001';

  const parts = formatted.split(',').map((p) => p.trim()).filter(Boolean);
  const cities = [
    'Bengaluru',
    'Bangalore',
    'Mumbai',
    'Delhi',
    'New Delhi',
    'Hyderabad',
    'Chennai',
    'Kolkata',
    'Pune',
    'Ahmedabad',
    'Jaipur',
    'Gurugram',
    'Noida',
  ];
  let city = 'Bengaluru';
  for (const p of parts) {
    const hit = cities.find((c) => p.toLowerCase().includes(c.toLowerCase()));
    if (hit) {
      city = hit === 'Bangalore' ? 'Bengaluru' : hit;
      break;
    }
  }

  const addressLine = parts[0] ?? formatted;
  const addressLine2 = parts.length > 1 ? parts.slice(1, 3).join(', ') : '';
  const locality = parts.length > 2 ? parts[2] : undefined;

  return { addressLine, addressLine2, city, postalCode, locality };
}
