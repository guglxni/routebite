/**
 * Seed a dev user for local API + E2E testing.
 * Session Bearer: routebite-dev-session
 * Swiggy token (mock): routebite-dev-token
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';
import { encryptToken, hashSessionToken } from '../src/middleware/auth';

export const DEV_ACCESS_TOKEN = process.env.MOCK_DEV_ACCESS_TOKEN ?? 'routebite-dev-token';
export const DEV_SESSION_TOKEN = process.env.DEV_SESSION_TOKEN ?? 'routebite-dev-session';

const db = getDb();
const sessionHash = hashSessionToken(DEV_SESSION_TOKEN);
const swiggyIdHash = 'routebite-dev-user';

const existing = await db.select().from(users).where(eq(users.swiggyIdHash, swiggyIdHash)).get();

const values = {
  swiggyIdHash,
  sessionToken: sessionHash,
  accessTokenEncrypted: encryptToken(DEV_ACCESS_TOKEN),
  tokenExpiry: new Date(Date.now() + 86400_000 * 30),
  updatedAt: new Date(),
};

if (existing) {
  await db.update(users).set(values).where(eq(users.id, existing.id));
  console.log('Updated dev user id=', existing.id);
} else {
  await db.insert(users).values(values);
  const created = await db.select().from(users).where(eq(users.swiggyIdHash, swiggyIdHash)).get();
  console.log('Created dev user id=', created?.id);
}

console.log('\nUse in requests:');
console.log(`  Authorization: Bearer ${DEV_SESSION_TOKEN}`);
console.log(`  Mock Swiggy token: ${DEV_ACCESS_TOKEN}`);
