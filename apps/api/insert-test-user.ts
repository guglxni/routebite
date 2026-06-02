import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';

const db = getDb();

// Insert a test user with a base64-encoded token that decrypts to "test-token"
const encryptedToken = Buffer.from('test-token').toString('base64');

try {
  await db.insert(users).values({
    swiggyIdHash: 'test-user-hash',
    accessTokenEncrypted: encryptedToken,
    refreshToken: 'test-refresh',
    tokenExpiry: new Date(Date.now() + 86400_000),
  }).onConflictDoNothing();
  console.log('Test user inserted. Token (base64):', encryptedToken);
} catch (e) {
  console.error('Error:', e);
}
