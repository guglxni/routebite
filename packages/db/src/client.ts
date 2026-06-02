import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

let client: Client | null = null;
let db: LibSQLDatabase<typeof schema> | null = null;

export function getClient(): Client {
  if (!client) {
    const url = process.env.DATABASE_URL ?? 'file:./local.db';
    const authToken = process.env.DATABASE_AUTH_TOKEN;

    client = createClient({
      url,
      ...(authToken ? { authToken } : {}),
    });
  }
  return client;
}

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!db) {
    db = drizzle(getClient(), { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

// Re-export schema for convenience
export { schema };
