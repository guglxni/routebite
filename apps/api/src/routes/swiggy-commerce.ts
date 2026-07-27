import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { intercepts, journeys, users } from '@routebite/db/schema';
import { SwiggyMCPClient } from '../services/swiggy/client';
import { RouteBiteError } from '../middleware/error-handler';
import {
  ensureSwiggyAddressId,
  FOOD_CART_CAP_RUPEES,
  INSTAMART_MIN_RUPEES,
} from '../services/order/swiggy-address';

/**
 * Builders Club–aligned commerce helpers for the SPA.
 * Docs: https://mcp.swiggy.com/builders/docs/reference/{food,instamart}
 */
const app = new Hono();

async function requireInterceptForUser(interceptId: string, userId: number) {
  const db = getDb();
  const point = await db.select().from(intercepts).where(eq(intercepts.id, interceptId)).get();
  if (!point) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Intercept not found', 404);
  }
  const journey = await db.select().from(journeys).where(eq(journeys.id, point.journeyId)).get();
  if (!journey || journey.userId !== userId) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Intercept not found', 404);
  }
  return point;
}

function wrapSwiggyAuth(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('401') ||
    msg.includes('UNAUTHORIZED') ||
    msg.includes('authentication') ||
    msg.includes('Token expired') ||
    msg.includes('re-authenticate')
  ) {
    throw new RouteBiteError(
      'SWIGGY_REAUTH_REQUIRED',
      'Swiggy session expired or missing. Reconnect Swiggy to continue ordering.',
      401
    );
  }
  throw err instanceof RouteBiteError
    ? err
    : new RouteBiteError('SWIGGY_ERROR', msg, 502);
}

function asCouponList(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.coupons)) return d.coupons as Array<Record<string, unknown>>;
    if (Array.isArray(d.offers)) return d.offers as Array<Record<string, unknown>>;
    if (Array.isArray(d.data)) return d.data as Array<Record<string, unknown>>;
  }
  return [];
}

/** COD-only filter per fetch_food_coupons agent guidance. */
function filterCodCoupons(coupons: Array<Record<string, unknown>>) {
  return coupons.filter((c) => {
    if (c.requiresOnlinePayment === true) return false;
    if (c.requiresOnlinePayment === false) return true;
    const payment = String(c.paymentType ?? c.payment_type ?? '').toLowerCase();
    if (payment.includes('online') || payment.includes('card') || payment.includes('upi')) {
      return false;
    }
    return true;
  });
}

// GET /api/v1/swiggy/status — token health for Reconnect CTA
app.get('/status', async (c) => {
  const user = c.get('user');
  const db = getDb();
  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  const expiry = row?.tokenExpiry ? new Date(row.tokenExpiry) : null;
  const expired = expiry ? expiry.getTime() < Date.now() : false;
  const isPortalDemo = Boolean(row?.username);
  return c.json({
    success: true,
    data: {
      swiggyLinked: Boolean(row?.accessTokenEncrypted),
      tokenExpired: expired,
      expiresAt: expiry?.toISOString() ?? null,
      needsReconnect: expired,
      /** Portal demo accounts use mock MCP tokens — OAuth reconnect is for live Swiggy. */
      portalDemo: isPortalDemo,
      reconnectPath: '/api/v1/auth/swiggy',
    },
  });
});

// GET /api/v1/swiggy/addresses
app.get('/addresses', async (c) => {
  const token = c.get('accessToken');
  const client = new SwiggyMCPClient(token);
  try {
    const res = await client.getAddresses('food');
    if (!res.success) wrapSwiggyAuth(new Error(res.error?.message ?? 'get_addresses failed'));
    return c.json({ success: true, data: res.data ?? [] });
  } catch (err) {
    wrapSwiggyAuth(err);
  }
});

const CreateAddressBody = z.object({
  interceptId: z.string().min(1),
  landmark: z.string().optional(),
});

// POST /api/v1/swiggy/addresses — create intercept delivery address (Instamart schema)
app.post('/addresses', zValidator('json', CreateAddressBody), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const token = c.get('accessToken');
  const point = await requireInterceptForUser(body.interceptId, user.id);
  const client = new SwiggyMCPClient(token);
  try {
    const created = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      {
        userName: user.name ?? 'RouteBite User',
        userPhone: '9999999999',
        landmark: body.landmark,
      }
    );
    return c.json({
      success: true,
      data: {
        addressId: created.addressId,
        label: created.address.label,
        formatted: created.address.formatted,
        lat: created.address.lat,
        lng: created.address.lng,
        city: created.address.city,
        postalCode: created.address.postalCode,
      },
    });
  } catch (err) {
    wrapSwiggyAuth(err);
  }
});

const PreviewBody = z.object({
  interceptId: z.string().min(1),
  server: z.enum(['food', 'instamart']),
  restaurantId: z.string().optional(),
  restaurantName: z.string().optional(),
  foodItems: z
    .array(
      z.object({
        menuItemId: z.string(),
        variantId: z.string().optional(),
        addonIds: z.array(z.string()).optional(),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
  productItems: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.string().optional(),
});

// POST /api/v1/swiggy/checkout-preview — sync cart + return payment methods / caps
app.post('/checkout-preview', zValidator('json', PreviewBody), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const token = c.get('accessToken');
  const point = await requireInterceptForUser(body.interceptId, user.id);
  const client = new SwiggyMCPClient(token);

  try {
    const created = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      {
        userName: user.name ?? 'RouteBite User',
        userPhone: '9999999999',
        landmark: `Intercept ${point.name ?? point.id}`,
      }
    );
    const addressId = created.addressId;

    let cartData: Record<string, unknown> = {};
    let coupons: Array<Record<string, unknown>> = [];
    let appliedCoupon: Record<string, unknown> | null = null;

    if (body.server === 'food') {
      if (!body.restaurantId) {
        throw new RouteBiteError('VALIDATION_ERROR', 'restaurantId required for food', 400);
      }
      await client.updateFoodCart({
        restaurantId: body.restaurantId,
        addressId,
        restaurantName: body.restaurantName,
        cartItems: (body.foodItems ?? []).map((it) => ({
          itemId: it.menuItemId,
          quantity: it.quantity,
          ...(it.variantId ? { variantId: it.variantId } : {}),
          ...(it.addonIds?.length ? { addOns: it.addonIds } : {}),
        })),
      });

      if (body.couponCode) {
        const applied = await client.applyFoodCoupon({
          couponCode: body.couponCode,
          addressId,
        });
        if (applied.success) {
          appliedCoupon = (applied.data as Record<string, unknown>) ?? { code: body.couponCode };
        }
      }

      const cart = await client.getFoodCart({
        addressId,
        restaurantName: body.restaurantName,
      });
      cartData = (cart.data as Record<string, unknown>) ?? {};

      const couponRes = await client.fetchFoodCoupons({
        restaurantId: body.restaurantId,
        addressId,
      });
      coupons = filterCodCoupons(asCouponList(couponRes.data));
    } else {
      await client.updateInstamartCart({
        selectedAddressId: addressId,
        items: (body.productItems ?? []).map((it) => ({
          spinId: it.variantId || it.productId,
          quantity: it.quantity,
        })),
      });
      const cart = await client.getInstamartCart();
      cartData = (cart.data as Record<string, unknown>) ?? {};
    }

    const total = Number(cartData.total ?? 0);
    const availablePaymentMethods = Array.isArray(cartData.availablePaymentMethods)
      ? (cartData.availablePaymentMethods as string[])
      : ['COD'];

    const overCap = total >= FOOD_CART_CAP_RUPEES;
    const underMin = body.server === 'instamart' && total > 0 && total < INSTAMART_MIN_RUPEES;

    return c.json({
      success: true,
      data: {
        addressId,
        address: {
          label: created.address.label,
          formatted: created.address.formatted,
          lat: created.address.lat,
          lng: created.address.lng,
          city: created.address.city,
          postalCode: created.address.postalCode,
        },
        cart: cartData,
        total,
        availablePaymentMethods,
        selectedPaymentMethod:
          body.paymentMethod && availablePaymentMethods.includes(body.paymentMethod)
            ? body.paymentMethod
            : availablePaymentMethods[0] ?? 'COD',
        coupons,
        appliedCoupon,
        caps: {
          foodMaxRupees: FOOD_CART_CAP_RUPEES,
          instamartMinRupees: INSTAMART_MIN_RUPEES,
        },
        violations: {
          overCap,
          underMin,
          message: overCap
            ? `Cart exceeds ₹${FOOD_CART_CAP_RUPEES} Builders Club testing cap — reduce items or use the Swiggy app.`
            : underMin
              ? `Instamart minimum is ₹${INSTAMART_MIN_RUPEES} — add more items.`
              : null,
        },
        canPlace: !overCap && !underMin && total > 0,
      },
    });
  } catch (err) {
    wrapSwiggyAuth(err);
  }
});

// GET /api/v1/swiggy/coupons?interceptId=&restaurantId=
app.get('/coupons', async (c) => {
  const interceptId = c.req.query('interceptId');
  const restaurantId = c.req.query('restaurantId');
  if (!interceptId || !restaurantId) {
    throw new RouteBiteError('VALIDATION_ERROR', 'interceptId and restaurantId required', 400);
  }
  const user = c.get('user');
  const token = c.get('accessToken');
  const point = await requireInterceptForUser(interceptId, user.id);
  const client = new SwiggyMCPClient(token);
  try {
    const created = await ensureSwiggyAddressId(
      client,
      { lat: point.lat, lng: point.lng },
      { userName: user.name ?? 'RouteBite User', userPhone: '9999999999' }
    );
    const res = await client.fetchFoodCoupons({
      restaurantId,
      addressId: created.addressId,
    });
    if (!res.success) wrapSwiggyAuth(new Error(res.error?.message ?? 'fetch_food_coupons failed'));
    return c.json({
      success: true,
      data: {
        addressId: created.addressId,
        coupons: filterCodCoupons(asCouponList(res.data)),
      },
    });
  } catch (err) {
    wrapSwiggyAuth(err);
  }
});

export default app;
