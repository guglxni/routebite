/** Bengaluru test coordinates — avoid Geocoding API dependency in integration tests */
export const KORAMANGALA: { lat: number; lng: number } = { lat: 12.9352, lng: 77.6245 };
export const WHITEFIELD: { lat: number; lng: number } = { lat: 12.9698, lng: 77.7499 };
export const INDIRANAGAR: { lat: number; lng: number } = { lat: 12.9784, lng: 77.6408 };

export function isMapsIntegrationEnabled(): boolean {
  return process.env.RUN_MAPS_INTEGRATION === '1' && Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/** Returns true when an error looks like a GCP API enablement / key restriction issue */
export function isGoogleApiAccessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('REQUEST_DENIED') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API_KEY_SERVICE_BLOCKED') ||
    msg.includes('SERVICE_DISABLED') ||
    msg.includes('has not been used in project')
  );
}

export async function skipIfApiUnavailable(
  label: string,
  probe: () => Promise<void>
): Promise<boolean> {
  try {
    await probe();
    return false;
  } catch (err) {
    if (isGoogleApiAccessError(err)) {
      console.warn(`[skip] ${label}: Google API not enabled or key restricted`);
      return true;
    }
    throw err;
  }
}
