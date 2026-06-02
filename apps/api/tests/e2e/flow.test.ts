import { describe, expect, test, beforeAll } from 'bun:test';

const API_BASE = process.env.API_BASE ?? 'http://localhost:8787';
const DEV_SESSION = process.env.DEV_SESSION_TOKEN ?? 'routebite-dev-session';
const RUN_E2E = process.env.RUN_E2E === '1';

async function api<T>(
  path: string,
  opts?: { method?: string; body?: unknown; auth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.auth !== false) headers.Authorization = `Bearer ${DEV_SESSION}`;

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: opts?.method ?? 'GET',
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const json = (await res.json()) as { success?: boolean; data?: T; error?: { message?: string; code?: string } };
  if (!res.ok) {
    throw new Error(`${json.error?.code ?? res.status}: ${json.error?.message ?? res.statusText}`);
  }
  return json.data as T;
}

const describeE2E = RUN_E2E ? describe : describe.skip;

describeE2E('RouteBite E2E flow', () => {
  let journeyId = '';
  let interceptId = '';
  let orderId = '';

  beforeAll(async () => {
    const health = await api<{ status: string }>('/health', { auth: false });
    expect(health.status).toBe('ok');
  });

  test('1. authenticated user profile', async () => {
    const me = await api<{ id: number }>('/user/me');
    expect(me.id).toBeGreaterThan(0);
  });

  test('2. analyze route and persist journey + intercepts', async () => {
    const analysis = await api<{
      journeyId: string;
      distanceMeters: number;
      durationSeconds: number;
      interceptCount: number;
    }>('/routes/analyze', {
      method: 'POST',
      body: {
        origin: 'Koramangala, Bengaluru',
        destination: 'Whitefield, Bengaluru',
        transportMode: 'car',
        vehicleDetails: { description: 'E2E test car' },
        validateAddresses: true,
      },
    });

    journeyId = analysis.journeyId;
    expect(analysis.distanceMeters).toBeGreaterThan(5000);
    expect(analysis.durationSeconds).toBeGreaterThan(0);
    expect(analysis.interceptCount).toBeGreaterThan(0);
  }, 120_000);

  test('3. list intercepts for journey', async () => {
    const points = await api<Array<{ id: string; score: number; dwellTime: number }>>(
      `/routes/${journeyId}/intercepts`
    );
    expect(points.length).toBeGreaterThan(0);
    interceptId = points[0]!.id;
    expect(points[0]!.score).toBeGreaterThanOrEqual(60);
  });

  test('4. browse restaurants at intercept via mock Swiggy', async () => {
    const data = await api<{ interceptId: string; restaurants: Array<{ id: string; name: string }> }>(
      `/intercepts/${interceptId}/restaurants`
    );
    expect(data.interceptId).toBe(interceptId);
    expect(data.restaurants.length).toBeGreaterThan(0);
  });

  test('5. fetch restaurant menu', async () => {
    const menu = await api<{ items: Array<{ id: string }>; categories: string[] }>(
      `/intercepts/${interceptId}/menu/res_1`
    );
    expect(menu.items.length).toBeGreaterThan(0);
  });

  test('6. place food order at intercept', async () => {
    const order = await api<{
      orderId: string;
      status: string;
      swiggyOrderId?: string;
    }>('/orders', {
      method: 'POST',
      body: {
        journeyId,
        interceptId,
        server: 'food',
        timing: 'now',
        restaurantId: 'res_1',
        foodItems: [{ menuItemId: 'item_1_1', variantId: 'v_2', addonIds: [], quantity: 1 }],
        paymentMethod: 'COD',
      },
    });

    orderId = order.orderId;
    expect(order.status).toBe('confirmed');
    expect(order.swiggyOrderId).toBeTruthy();
  }, 60_000);

  test('7. track order alignment', async () => {
    const track = await api<{
      orderId: string;
      status: string;
      alignmentStatus: { status: string; score: number } | null;
    }>(`/orders/${orderId}/track`);

    expect(track.orderId).toBe(orderId);
    expect(track.status).toBeTruthy();
  });
});
