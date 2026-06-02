import crypto from 'crypto';
import type { PKCEPair, TokenResponse, OAuthError } from './types';
import { defaultConfig } from './types';

/**
 * Generate a PKCE pair (S256).
 */
export function generatePKCE(): PKCEPair {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  return { codeVerifier, codeChallenge, state };
}

/**
 * Build the Swiggy OAuth authorization URL.
 */
export function buildAuthorizeUrl(
  pkce: PKCEPair,
  config = defaultConfig
): string {
  const url = new URL(`${config.baseUrl}/auth/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', pkce.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', pkce.state);
  return url.toString();
}

/**
 * Exchange authorization code for access token.
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  config = defaultConfig
): Promise<TokenResponse> {
  const res = await fetch(`${config.baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as OAuthError;
    throw new Error(`Token exchange failed: ${err.error_description ?? err.error ?? res.statusText}`);
  }

  return res.json() as Promise<TokenResponse>;
}

/**
 * Revoke an access token (logout).
 */
export async function revokeToken(
  accessToken: string,
  config = defaultConfig
): Promise<void> {
  await fetch(`${config.baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
