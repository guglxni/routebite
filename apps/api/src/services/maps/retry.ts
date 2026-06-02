const RETRYABLE = /403|429|REQUEST_DENIED|PERMISSION_DENIED|RESOURCE_EXHAUSTED|UNAVAILABLE/i;

export async function withGoogleRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!RETRYABLE.test(msg) || attempt === maxAttempts - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}
