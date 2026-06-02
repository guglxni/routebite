import { describe, expect, test, beforeAll } from "bun:test";

const API_BASE = process.env.API_BASE ?? "http://localhost:8787";
const DEV_SESSION = process.env.DEV_SESSION_TOKEN ?? "routebite-dev-session";
const RUN_WEB_INTEGRATION = process.env.RUN_WEB_INTEGRATION === "1";

async function api<T>(
  path: string,
  opts?: { method?: string; body?: unknown; auth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.auth !== false) headers.Authorization = `Bearer ${DEV_SESSION}`;

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const json = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string; code?: string };
  };

  if (!res.ok) {
    throw new Error(`${json.error?.code ?? res.status}: ${json.error?.message ?? res.statusText}`);
  }
  return json.data as T;
}

const describeWeb = RUN_WEB_INTEGRATION ? describe : describe.skip;

describeWeb("Frontend ↔ API integration", () => {
  let journeyId = "";

  beforeAll(async () => {
    const health = await api<{ status: string }>("/health", { auth: false });
    expect(health.status).toBe("ok");
  });

  test("auth profile loads for dev session", async () => {
    const me = await api<{ id: number }>("/user/me");
    expect(me.id).toBeGreaterThan(0);
  });

  test("route analyze + journey detail + intercepts chain", async () => {
    const analysis = await api<{
      journeyId: string;
      interceptCount: number;
    }>("/routes/analyze", {
      method: "POST",
      body: {
        origin: "Koramangala, Bengaluru",
        destination: "Whitefield, Bengaluru",
        transportMode: "car",
        vehicleDetails: { description: "Web integration test" },
        validateAddresses: true,
      },
    });

    journeyId = analysis.journeyId;
    expect(analysis.interceptCount).toBeGreaterThan(0);

    const journey = await api<{
      id: string;
      routePoints: Array<{ lat: number; lng: number }>;
      interceptCount: number;
    }>(`/routes/${journeyId}`);

    expect(journey.routePoints.length).toBeGreaterThan(2);
    expect(journey.interceptCount).toBe(analysis.interceptCount);

    const intercepts = await api<Array<{ id: string; lat: number; lng: number }>>(
      `/routes/${journeyId}/intercepts`,
    );
    expect(intercepts.length).toBeGreaterThan(0);
  }, 120_000);

  test("restaurants and menu load for first intercept", async () => {
    const intercepts = await api<Array<{ id: string }>>(`/routes/${journeyId}/intercepts`);
    const interceptId = intercepts[0]!.id;

    const restaurants = await api<{ restaurants: unknown[] }>(
      `/intercepts/${interceptId}/restaurants`,
    );
    expect(restaurants.restaurants.length).toBeGreaterThan(0);

    const menu = await api<{ items: unknown[] }>(`/intercepts/${interceptId}/menu/res_1`);
    expect(menu.items.length).toBeGreaterThan(0);
  });

  test("orders list endpoint returns array", async () => {
    const orders = await api<unknown[]>("/orders");
    expect(Array.isArray(orders)).toBe(true);
  });
});
