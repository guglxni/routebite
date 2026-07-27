import { getClient } from '@routebite/db/client';

/**
 * Idempotent SQLite column adds for portal / rider ops features.
 * Safe to run on every API boot and seed.
 */
export async function ensurePortalSchema(): Promise<void> {
  const client = getClient();

  const userCols = await client.execute(`PRAGMA table_info(users)`);
  const userNames = new Set(userCols.rows.map((r) => String(r.name)));
  const userAlters: string[] = [];
  if (!userNames.has('username')) userAlters.push(`ALTER TABLE users ADD COLUMN username text`);
  if (!userNames.has('email')) userAlters.push(`ALTER TABLE users ADD COLUMN email text`);
  if (!userNames.has('name')) userAlters.push(`ALTER TABLE users ADD COLUMN name text`);
  if (!userNames.has('role')) {
    userAlters.push(`ALTER TABLE users ADD COLUMN role text DEFAULT 'user' NOT NULL`);
  }
  if (!userNames.has('rider_presence')) {
    userAlters.push(`ALTER TABLE users ADD COLUMN rider_presence text DEFAULT 'offline'`);
  }
  if (!userNames.has('last_lat')) userAlters.push(`ALTER TABLE users ADD COLUMN last_lat real`);
  if (!userNames.has('last_lng')) userAlters.push(`ALTER TABLE users ADD COLUMN last_lng real`);
  if (!userNames.has('last_location_at')) {
    userAlters.push(`ALTER TABLE users ADD COLUMN last_location_at integer`);
  }

  for (const stmt of userAlters) {
    await client.execute(stmt);
    console.log('[migrate]', stmt);
  }

  const orderCols = await client.execute(`PRAGMA table_info(orders)`);
  const orderNames = new Set(orderCols.rows.map((r) => String(r.name)));
  if (!orderNames.has('rider_id')) {
    const stmt = `ALTER TABLE orders ADD COLUMN rider_id integer REFERENCES users(id) ON DELETE SET NULL`;
    await client.execute(stmt);
    console.log('[migrate]', stmt);
  }
}
