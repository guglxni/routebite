import { getDb } from '@routebite/db/client';
import { users } from '@routebite/db/schema';

const db = getDb();
const allUsers = await db.select().from(users);
console.log('Users:', JSON.stringify(allUsers, null, 2));
