import { Hono } from 'hono';
import { getDb } from '@routebite/db/client';
import { sql } from 'drizzle-orm';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    },
  });
});

app.get('/api/v1/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    },
  });
});

app.get('/health/db', async (c) => {
  try {
    const db = getDb();
    // Simple query to verify DB connectivity — drizzle-orm runs()
    await db.run(sql`SELECT 1`);
    return c.json({
      success: true,
      data: {
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    return c.json({
      success: false,
      error: {
        code: 'DB_ERROR',
        message: 'Database connection failed',
        requestId: c.get('requestId'),
      },
    }, 503);
  }
});

export default app;
