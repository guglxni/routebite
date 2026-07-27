import type { SwiggyMCPClient } from '../swiggy/client';
import { generateInterceptAddress, toCreateAddressArgs } from './address';
import type { GeneratedAddress } from './types';

/**
 * Create (or best-effort resolve) a Swiggy delivery address for an intercept.
 * Uses Instamart `create_address` schema from Builders Club docs.
 */
export async function ensureSwiggyAddressId(
  client: SwiggyMCPClient,
  point: { lat: number; lng: number },
  opts: {
    userName: string;
    userPhone: string;
    landmark?: string;
  }
): Promise<{ addressId: string; address: GeneratedAddress }> {
  const address = await generateInterceptAddress(point);
  const args = toCreateAddressArgs(address, {
    userName: opts.userName,
    userPhone: opts.userPhone,
    landmark: opts.landmark,
    addressCategory: 'OTHER',
  });

  const res = await client.createAddress(args);
  if (!res.success) {
    throw new Error(res.error?.message ?? 'create_address failed');
  }

  const data = (res.data ?? {}) as { id?: string; addressId?: string };
  const addressId = data.addressId ?? data.id;
  if (!addressId) {
    throw new Error('create_address returned no address id');
  }

  return { addressId, address };
}

/** Builders Club Food cart cap (₹). */
export const FOOD_CART_CAP_RUPEES = 1000;

/** Instamart minimum order (₹) from recipes. */
export const INSTAMART_MIN_RUPEES = 99;
