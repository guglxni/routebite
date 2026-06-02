import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, journeys } from '@routebite/db/schema';

const app = new Hono();

// GET /api/v1/user/me
app.get('/me', async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: {
      id: user.id,
    },
  });
});

// GET /api/v1/user/orders
app.get('/orders', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .all();

  // Enrich with journey details
  const enriched = await Promise.all(
    userOrders.map(async (order) => {
      if (!order.journeyId) return { ...order, journey: null };
      const journey = await db.select().from(journeys).where(eq(journeys.id, order.journeyId)).get();
      return { ...order, journey: journey ?? null };
    })
  );

  return c.json({
    success: true,
    data: { orders: enriched },
  });
});

export default app;
