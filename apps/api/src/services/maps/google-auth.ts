/**
 * Auth helpers for Google Maps Platform endpoints that require ADC/OAuth
 * (Places Aggregate, Route Optimization) vs API-key services.
 *
 * @see gmp-common-api-keys agent skill — Aggregate/Route Optimization reject API keys (401).
 */

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
/** Negative cache so we don't respawn gcloud on every Aggregate call. */
let adcUnavailableUntil = 0;

/**
 * Best-effort Application Default Credentials access token.
 * Returns null when ADC is unavailable (local demo API-key path → Nearby fallback).
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }
  if (now < adcUnavailableUntil) {
    return null;
  }

  // Opt-out for unit tests / local demo without ADC
  if (process.env.SKIP_GOOGLE_ADC === '1' || process.env.NODE_ENV === 'test') {
    adcUnavailableUntil = now + 60_000;
    return null;
  }

  // Cloud Run / GCE metadata server
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(800),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as { access_token?: string; expires_in?: number };
      if (data.access_token) {
        cachedAccessToken = {
          token: data.access_token,
          expiresAt: now + (data.expires_in ?? 3000) * 1000,
        };
        return data.access_token;
      }
    }
  } catch {
    // Not on GCP
  }

  // Local: gcloud application-default credentials (hard timeout)
  try {
    const proc = Bun.spawn(
      ['gcloud', 'auth', 'application-default', 'print-access-token'],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    const timeout = AbortSignal.timeout(2000);
    const outPromise = new Response(proc.stdout).text();
    const raced = await Promise.race([
      outPromise.then(async (text) => {
        const code = await proc.exited;
        return { text: text.trim(), code };
      }),
      new Promise<{ text: string; code: number }>((_, reject) => {
        timeout.addEventListener('abort', () => {
          try {
            proc.kill();
          } catch {
            /* ignore */
          }
          reject(new Error('gcloud ADC timeout'));
        });
      }),
    ]);
    if (raced.code === 0 && raced.text.length > 20) {
      cachedAccessToken = { token: raced.text, expiresAt: now + 50 * 60_000 };
      return raced.text;
    }
  } catch {
    // gcloud missing / ADC not configured / timeout
  }

  adcUnavailableUntil = now + 5 * 60_000;
  return null;
}

export function clearGoogleAccessTokenCache(): void {
  cachedAccessToken = null;
  adcUnavailableUntil = 0;
}
