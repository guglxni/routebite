import { getClient } from '@routebite/db/client';

const ORDER_COLS: Array<{ name: string; ddl: string }> = [
  { name: 'auto_place_at', ddl: 'ALTER TABLE orders ADD COLUMN auto_place_at integer' },
  { name: 'deferred_payload_json', ddl: 'ALTER TABLE orders ADD COLUMN deferred_payload_json text' },
  { name: 'place_attempts', ddl: 'ALTER TABLE orders ADD COLUMN place_attempts integer DEFAULT 0' },
  { name: 'last_place_error', ddl: 'ALTER TABLE orders ADD COLUMN last_place_error text' },
  { name: 'swiggy_address_id', ddl: 'ALTER TABLE orders ADD COLUMN swiggy_address_id text' },
  { name: 'meal_query_hint', ddl: 'ALTER TABLE orders ADD COLUMN meal_query_hint text' },
  { name: 'halt_gate_json', ddl: 'ALTER TABLE orders ADD COLUMN halt_gate_json text' },
];

/** Idempotent SQLite column ensure for MVP (no Turso migrate on VPS). */
export async function ensureFusionSchema(): Promise<void> {
  const client = getClient();
  const cols = await client.execute(`PRAGMA table_info(orders)`);
  const existing = new Set(
    (cols.rows as Array<{ name?: string }>).map((r) => String(r.name ?? ''))
  );
  for (const col of ORDER_COLS) {
    if (existing.has(col.name)) continue;
    try {
      await client.execute(col.ddl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) {
        console.warn(`[fusion-schema] ${col.name}: ${msg}`);
      }
    }
  }
}
