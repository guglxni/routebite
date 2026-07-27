import { Hono } from "hono";
import { requireAuth } from "./auth.js";
import { restaurants, menuItems, carts, ensureCart, ensureAddresses, ensureOrders, generateOrderId } from "./data.js";
import { parseToolCall, toolSuccess, toolFailure } from "./mcp.js";
import crypto from "crypto";

export const foodRouter = new Hono();

function sessionId(c: any) {
  const auth = c.req.header("Authorization");
  return auth?.replace("Bearer ", "") ?? "anon";
}

foodRouter.use(async (c, next) => {
  if (!requireAuth(c)) {
    return c.json({ success: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  await next();
});

foodRouter.post("/*", async (c) => {
  const { tool, params: body, rpcId } = await parseToolCall(c, "food");
  const bodyAny = body as Record<string, any>;
  const sid = sessionId(c);
  const ok = (data: unknown, message?: string) => c.json(toolSuccess(data, message, rpcId));
  const fail = (message: string, code?: string, status: number = 400) => {
    const f = toolFailure(message, code, status, rpcId);
    return c.json(f.body, f.status as 400);
  };

  switch (tool) {
    case "get_addresses": {
      const addrs = ensureAddresses(sid);
      return c.json({ success: true, data: addrs });
    }

    case "search_restaurants": {
      if (!bodyAny.addressId) {
        return fail("Missing required parameter: addressId", "VALIDATION_ERROR");
      }
      const query = bodyAny.query ?? "food";
      const { lat, lng } = bodyAny;
      let results = [...restaurants];
      if (query) {
        const q = String(query).toLowerCase();
        results = results.filter(r => r.name.toLowerCase().includes(q) || r.cuisine.some(c => c.toLowerCase().includes(q)));
      }
      const open = results.filter(r => r.availabilityStatus === "OPEN").map(r => {
        let distanceKm = r.distanceKm;
        if (typeof lat === "number" && typeof lng === "number" && typeof r.lat === "number" && typeof r.lng === "number") {
          const R = 6371;
          const dLat = ((r.lat - lat) * Math.PI) / 180;
          const dLng = ((r.lng - lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat * Math.PI) / 180) * Math.cos((r.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
        }
        return { ...r, distanceKm };
      });
      return c.json({
        success: true,
        data: {
          restaurants: open,
          total: open.length,
        },
        session_id: `sess_${crypto.randomBytes(8).toString("hex")}`,
      });
    }

    case "get_restaurant_menu": {
      if (!bodyAny.addressId || !bodyAny.restaurantId) {
        return fail("Missing required parameter: addressId and restaurantId", "VALIDATION_ERROR");
      }
      const { restaurantId } = bodyAny;
      const items = menuItems[restaurantId] || [];
      return ok({ restaurantId, items, categories: [...new Set(items.map((i: any) => i.category))] });
    }

    case "search_menu": {
      if (!bodyAny.addressId || !bodyAny.query) {
        return fail("Missing required parameter: addressId and query", "VALIDATION_ERROR");
      }
      const restaurantId = bodyAny.restaurantIdOfAddedItem ?? bodyAny.restaurantId;
      let items: any[] = restaurantId ? menuItems[restaurantId] || [] : Object.values(menuItems).flat();
      const q = String(bodyAny.query).toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
      return ok({ items, total: items.length });
    }

    case "update_food_cart": {
      if (!bodyAny.restaurantId || !bodyAny.addressId) {
        return fail("Missing required parameter: restaurantId and addressId", "VALIDATION_ERROR");
      }
      const restaurantId = bodyAny.restaurantId;
      const newItems = bodyAny.cartItems ?? bodyAny.items ?? [];
      const cart = ensureCart(sid);
      if (cart.restaurantId && cart.restaurantId !== restaurantId && newItems?.length) {
        cart.items = [];
      }
      cart.restaurantId = restaurantId;
      newItems.forEach((it: any) => {
        const itemId = it.itemId ?? it.menuItemId;
        const existing = cart.items.find((ci: any) => ci.itemId === itemId && ci.variantId === it.variantId);
        if (existing) {
          existing.quantity = it.quantity || 1;
        } else {
          cart.items.push({
            itemId,
            name: it.name,
            variantId: it.variantId,
            addOns: it.addOns || it.addons || [],
            quantity: it.quantity || 1,
          });
        }
      });
      return ok({ restaurantId, items: cart.items, addressId: bodyAny.addressId });
    }

    case "get_food_cart": {
      if (!bodyAny.addressId) {
        return fail("Missing required parameter: addressId", "VALIDATION_ERROR");
      }
      const cart = ensureCart(sid);
      const menuFlat = Object.values(menuItems).flat();
      const enriched = cart.items.map((ci: any) => {
        const mi = menuFlat.find((m: any) => m.id === ci.itemId);
        const variant = mi?.variants?.find((v: any) => v.id === ci.variantId) || { name: "Regular", price: mi?.price || 0 };
        const addonTotal = (ci.addOns || []).reduce((s: number, a: any) => {
          const addon = mi?.addOns?.find((ma: any) => ma.id === (a.id || a));
          return s + (addon?.price || 0);
        }, 0);
        return {
          ...ci,
          name: mi?.name || ci.name,
          price: variant.price + addonTotal,
          variantName: variant.name,
        };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
      const deliveryFee = subtotal > 0 ? 40 : 0;
      const tax = Math.round(subtotal * 0.05);
      const total = subtotal + deliveryFee + tax;
      return ok({
        restaurantId: cart.restaurantId,
        items: enriched,
        subtotal,
        deliveryFee,
        tax,
        total,
        availablePaymentMethods: ["COD"],
        valid_addons: menuFlat.find((m) => m.id === enriched[0]?.itemId)?.addOns || [],
      });
    }

    case "flush_food_cart": {
      carts.set(sid, { items: [] });
      return ok({ cleared: true });
    }

    case "fetch_food_coupons": {
      if (!bodyAny.restaurantId || !bodyAny.addressId) {
        return fail("Missing required parameter: restaurantId and addressId", "VALIDATION_ERROR");
      }
      return ok([
        { code: "WELCOME50", description: "50% off up to ₹100", minOrder: 200, maxDiscount: 100, requiresOnlinePayment: false },
        { code: "FREEDEL", description: "Free delivery", minOrder: 300, maxDiscount: 40, requiresOnlinePayment: false },
        { code: "INSTANT20", description: "20% off", minOrder: 500, maxDiscount: 150, requiresOnlinePayment: true },
      ]);
    }

    case "apply_food_coupon": {
      const couponCode = bodyAny.couponCode ?? bodyAny.code;
      if (!bodyAny.addressId || !couponCode) {
        return fail("Missing required parameter: couponCode and addressId", "VALIDATION_ERROR");
      }
      if (!["WELCOME50", "FREEDEL"].includes(couponCode)) {
        return fail("Coupon invalid or unavailable", "COUPON_INVALID");
      }
      return ok({ code: couponCode, applied: true, coupon_discount: couponCode === "WELCOME50" ? 50 : 40 });
    }

    case "place_food_order": {
      if (!bodyAny.addressId) {
        return fail("Missing required parameter: addressId", "VALIDATION_ERROR");
      }
      const paymentMethod = bodyAny.paymentMethod ?? "COD";
      const cart = ensureCart(sid);
      const menuFlat = Object.values(menuItems).flat();
      const enriched = cart.items.map((ci: any) => {
        const mi = menuFlat.find((m: any) => m.id === ci.itemId);
        const variant = mi?.variants?.find((v: any) => v.id === ci.variantId) || { name: "Regular", price: mi?.price || 0 };
        return { ...ci, name: mi?.name || ci.name, price: variant.price };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
      const total = subtotal + 40 + Math.round(subtotal * 0.05);

      if (total >= 1000) {
        return fail("Cart exceeds ₹1000 cap", "CART_LIMIT_EXCEEDED");
      }
      if (total === 0) {
        return fail("Cart is empty", "EMPTY_CART");
      }

      const orderId = generateOrderId();
      const addrs = ensureAddresses(sid);
      const lastAddr = addrs[addrs.length - 1];
      const deliveryInstructions = (lastAddr as any)?.landmark as string | undefined;

      const order = {
        orderId,
        restaurantId: cart.restaurantId,
        items: enriched,
        total,
        paymentMethod,
        status: "PLACED",
        placedAt: new Date().toISOString(),
        deliveryEta: "30-40 min",
        deliveryInstructions,
        addressId: bodyAny.addressId,
        server: "food",
      };

      const ords = ensureOrders(sid);
      ords.unshift(order);
      carts.set(sid, { items: [] });

      return ok(
        { orderId, status: "PLACED", total, estimatedDelivery: "30-40 min" },
        "Swiggy order placed successfully"
      );
    }

    case "get_food_orders": {
      const ords = ensureOrders(sid);
      return c.json({ success: true, data: { orders: ords.slice(0, 20) } });
    }

    case "get_food_order_details": {
      const { orderId } = bodyAny;
      const ords = ensureOrders(sid);
      const order = ords.find((o: any) => o.orderId === orderId);
      if (!order) return c.json({ success: false, error: { message: "Order not found", code: "ORDER_NOT_FOUND" } }, 404);
      return c.json({ success: true, data: order });
    }

    case "track_food_order": {
      const { orderId } = bodyAny;
      const ords = ensureOrders(sid);
      const order = ords.find((o: any) => o.orderId === orderId);
      if (!order) return c.json({ success: false, error: { message: "Order not found", code: "ORDER_NOT_FOUND" } }, 404);

      const statuses = ["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
      const currentIdx = statuses.indexOf(order.status);
      const now = Date.now();
      const placedAt = new Date(order.placedAt).getTime();
      const elapsed = Math.floor((now - placedAt) / 1000);

      // Auto-advance status every 15s for demo
      let status = order.status;
      if (elapsed > 0) status = statuses[Math.min(currentIdx + Math.floor(elapsed / 15), statuses.length - 1)];

      return c.json({
        success: true,
        data: {
          orderId,
          status,
          statusText: status.replace(/_/g, " "),
          deliveryPartner: { name: "Ravi K.", phone: "+91-98765-43210", vehicle: "Hero Splendor (DL3S AB 1234)" },
          delivery_instructions: order.deliveryInstructions,
          deliveryInstructions: order.deliveryInstructions,
          currentLocation: { lat: 28.61 + Math.random() * 0.01, lng: 77.23 + Math.random() * 0.01 },
          rider_location: { lat: 28.61 + Math.random() * 0.01, lng: 77.23 + Math.random() * 0.01 },
          rider_eta: Math.max(300, 1800 - elapsed * 2),
          customer_eta: Math.max(240, 1500 - elapsed * 2),
          eta: status === "DELIVERED" ? "Delivered" : `${Math.max(5, 30 - Math.floor(elapsed / 60))} min`,
        },
      });
    }

    case "report_error": {
      return c.json({ success: true, data: { mailto: "mailto:security@swiggy.in", summary: "Error reported" } });
    }

    default:
      return c.json({ success: false, error: { message: `Unknown tool: ${tool}`, code: "TOOL_NOT_FOUND" } }, 404);
  }
});
