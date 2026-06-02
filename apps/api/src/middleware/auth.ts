import crypto from 'crypto';
import { createMiddleware } from 'hono/factory';
import { RouteBiteError } from './error-handler';
import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';
import { eq } from 'drizzle-orm';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

/**
 * Derive the AES-256 encryption key from ENCRYPTION_KEY env var.
 * CRASHES on startup if the key is missing — no dev fallback.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'FATAL: ENCRYPTION_KEY environment variable is required. ' +
        'Set a 64-character hex string (32 bytes) before starting the server.'
    );
  }
  if (raw.length === KEY_LEN * 2) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

// Validate key once at module load — fail fast on misconfiguration
const _key = getKey();

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, _key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

export function decryptToken(encrypted: string): string {
  const data = Buffer.from(encrypted, 'base64');
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = data.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, _key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Hash an opaque session token for safe DB storage & lookup.
 * Uses SHA-256 — sufficient for opaque Bearer tokens (high entropy).
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new RouteBiteError(
      'UNAUTHORIZED',
      'Missing or invalid Authorization header',
      401
    );
  }

  const sessionToken = authHeader.slice(7);
  const tokenHash = hashSessionToken(sessionToken);

  try {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.sessionToken, tokenHash),
    });

    if (!user) {
      throw new RouteBiteError('UNAUTHORIZED', 'Invalid or expired session', 401);
    }

    const accessToken = decryptToken(user.accessTokenEncrypted);

    // Check token expiry
    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new RouteBiteError('UNAUTHORIZED', 'Token expired. Please re-authenticate.', 401);
    }

    c.set('user', { id: user.id, swiggyIdHash: user.swiggyIdHash });
    c.set('accessToken', accessToken);
    await next();
  } catch (err) {
    if (err instanceof RouteBiteError) throw err;
    throw new RouteBiteError('UNAUTHORIZED', 'Authentication failed', 401);
  }
});

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: number; swiggyIdHash: string };
    accessToken: string;
  }
}
