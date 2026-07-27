/**
 * Seed portal users (user / rider / admin) + legacy DEV_SESSION_TOKEN for user.
 *
 * Portal login (hardcoded):
 *   user  / user123  → /dashboard
 *   rider / rider123 → /rider
 *   admin / admin123 → /admin
 *
 * Legacy Bearer still works for the user account:
 *   Authorization: Bearer routebite-dev-session
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';
import { encryptToken, hashSessionToken } from '../src/middleware/auth';
import { ensurePortalSchema } from '../src/lib/portal-migrate';
import { PORTAL_ACCOUNTS } from '../src/services/auth/portal-accounts';

export const DEV_ACCESS_TOKEN = process.env.MOCK_DEV_ACCESS_TOKEN ?? 'routebite-dev-token';
export const DEV_SESSION_TOKEN = process.env.DEV_SESSION_TOKEN ?? 'routebite-dev-session';

await ensurePortalSchema();

const db = getDb();
const expiry = new Date(Date.now() + 86400_000 * 90);

// Free session hashes we're about to assign (avoid UNIQUE collisions)
const sessionPlains = PORTAL_ACCOUNTS.map((a) =>
  a.role === 'user' ? DEV_SESSION_TOKEN : `routebite-dev-${a.role}`
);
const sessionHashes = sessionPlains.map((p) => hashSessionToken(p));
for (const h of sessionHashes) {
  await db
    .update(users)
    .set({ sessionToken: null, updatedAt: new Date() })
    .where(eq(users.sessionToken, h));
}

for (const account of PORTAL_ACCOUNTS) {
  const accessTokenEncrypted = encryptToken(
    account.role === 'user' ? DEV_ACCESS_TOKEN : `portal-mock-token:${account.username}`
  );
  const sessionPlain =
    account.role === 'user' ? DEV_SESSION_TOKEN : `routebite-dev-${account.role}`;
  const sessionHash = hashSessionToken(sessionPlain);

  // Prefer portal id; for user also adopt legacy seed row
  let existing = await db
    .select()
    .from(users)
    .where(eq(users.swiggyIdHash, account.portalId))
    .get();

  if (!existing && account.role === 'user') {
    existing = await db
      .select()
      .from(users)
      .where(eq(users.swiggyIdHash, 'routebite-dev-user'))
      .get();
  }

  if (!existing && account.username) {
    existing = await db
      .select()
      .from(users)
      .where(eq(users.username, account.username))
      .get();
  }

  const values = {
    swiggyIdHash: account.portalId,
    username: account.username,
    email: account.email,
    name: account.name,
    role: account.role,
    sessionToken: sessionHash,
    accessTokenEncrypted,
    tokenExpiry: expiry,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(users).set(values).where(eq(users.id, existing.id));
    console.log(`Updated ${account.role} user id=`, existing.id, `(${account.username})`);
  } else {
    await db.insert(users).values(values);
    const created = await db
      .select()
      .from(users)
      .where(eq(users.swiggyIdHash, account.portalId))
      .get();
    console.log(`Created ${account.role} user id=`, created?.id, `(${account.username})`);
  }
}

console.log('\nPortal login (hardcoded):');
for (const a of PORTAL_ACCOUNTS) {
  console.log(`  ${a.username} / ${a.password}  →  ${a.homePath}  (${a.role})`);
}
console.log('\nLegacy user Bearer still works:');
console.log(`  Authorization: Bearer ${DEV_SESSION_TOKEN}`);
