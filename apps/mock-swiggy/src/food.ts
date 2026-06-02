import { Hono } from "hono";
import { requireAuth } from "./auth.js";
import { restaurants, menuItems, carts, ensureCart, ensureAddresses, ensureOrders, generateOrderId } from "./data.js";
import { parseToolCall } from "./mcp.js";
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
  const { tool, params: body } = await parseToolCall(c, "food");
  const bodyAny = body as Record<string, any>;
  const sid = sessionId(c);

  switch (tool) {
    case "get_addresses": {
      const addrs = ensureAddresses(sid);
      return c.json({ success: true, data: addrs });
    }

    case "create_address": {
      const { label, address, landmark } = bodyAny;
      const addrs = ensureAddresses(sid);
      const id = `addr_${addrs.length + 1}`;
      const newAddr = { id, label: label || "Other", address, landmark };
      addrs.push(newAddr);
      return c.json({ success: true, data: newAddr });
    }

    case "search_restaurants": {
      const { addressId, query, lat, lng } = bodyAny;
      let results = [...restaurants];
      if (query) {
        const q = query.toLowerCase();
        results = results.filter(r => r.name.toLowerCase().includes(q) || r.cuisine.some(c => c.toLowerCase().includes(q)));
      }
      return c.json({
        success: true,
        data: {
          restaurants: results.filter(r => r.availabilityStatus === "OPEN"),
          total: results.length,
        },
        session_id: `sess_${crypto.randomBytes(8).toString("hex")}`,
      });
    }

    case "get_restaurant_menu": {
      const { restaurantId } = bodyAny;
      const items = menuItems[restaurantId] || [];
      return c.json({
        success: true,
        data: { restaurantId, items, categories: [...new Set(items.map(i => i.category))] },
      });
    }

    case "search_menu": {
      const { restaurantId, query } = bodyAny;
      let items: any[] = [];
      if (restaurantId) {
        items = menuItems[restaurantId] || [];
      } else {
        items = Object.values(menuItems).flat();
      }
      if (query) {
        const q = query.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
      }
      return c.json({ success: true, data: { items, total: items.length } });
    }

    case "update_food_cart": {
      const { restaurantId, items: newItems } = bodyAny;
      const cart = ensureCart(sid);
      if (cart.restaurantId && cart.restaurantId !== restaurantId && newItems?.length) {
        cart.items = [];
      }
      cart.restaurantId = restaurantId;
      newItems.forEach((it: any) => {
        const existing = cart.items.find((ci: any) => ci.itemId === it.itemId && ci.variantId === it.variantId);
        if (existing) {
          existing.quantity = it.quantity || 1;
        } else {
          cart.items.push({ itemId: it.itemId, name: it.name, variantId: it.variantId, addOns: it.addOns || [], quantity: it.quantity || 1 });
        }
      });
      return c.json({ success: true, data: { restaurantId, items: cart.items } });
    }

    case "get_food_cart": {
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
      return c.json({
        success: true,
        data: {
          restaurantId: cart.restaurantId,
          items: enriched,
          subtotal,
          deliveryFee,
          tax,
          total,
          valid_addons: menuFlat.find(m => m.id === enriched[0]?.itemId)?.addOns || [],
        },
      });
    }

    case "flush_food_cart": {
      carts.set(sid, { items: [] });
      return c.json({ success: true, data: { cleared: true } });
    }

    case "fetch_food_coupons": {
      return c.json({
        success: true,
        data: [
          { code: "WELCOME50", description: "50% off up to ₹100", minOrder: 200, maxDiscount: 100, requiresOnlinePayment: false },
          { code: "FREEDEL", description: "Free delivery", minOrder: 300, maxDiscount: 40, requiresOnlinePayment: false },
          { code: "INSTANT20", description: "20% off", minOrder: 500, maxDiscount: 150, requiresOnlinePayment: true },
        ],
      });
    }

    case "apply_food_coupon": {
      const { code } = bodyAny;
      if (!["WELCOME50", "FREEDEL"].includes(code)) {
        return c.json({ success: false, error: { message: "Coupon invalid or unavailable", code: "COUPON_INVALID" } }, 400);
      }
      return c.json({ success: true, data: { code, applied: true } });
    }

    case "place_food_order": {
      const { paymentMethod = "COD" } = bodyAny;
      const cart = ensureCart(sid);
      const menuFlat = Object.values(menuItems).flat();
      const enriched = cart.items.map((ci: any) => {
        const mi = menuFlat.find((m: any) => m.id === ci.itemId);
        const variant = mi?.variants?.find((v: any) => v.id === ci.variantId) || { name: "Regular", price: mi?.price || 0 };
        return { ...ci, name: mi?.name || ci.name, price: variant.price };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
      const total = subtotal + 40 + Math.round(subtotal * 0.05);

      if (total > 1000) {
        return c.json({ success: false, error: { message: "Cart exceeds ₹1000 cap", code: "CART_LIMIT_EXCEEDED" } }, 400);
      }

      if (total === 0) {
        return c.json({ success: false, error: { message: "Cart is empty", code: "EMPTY_CART" } }, 400);
      }

      const orderId = generateOrderId();
      const order = {
        orderId,
        restaurantId: cart.restaurantId,
        items: enriched,
        total,
        paymentMethod,
        status: "PLACED",
        placedAt: new Date().toISOString(),
        deliveryEta: "30-40 min",
      };

      const ords = ensureOrders(sid);
      ords.unshift(order);

      // Flush cart
      carts.set(sid, { items: [] });

      return c.json({
        success: true,
        data: { orderId, status: "PLACED", total, estimatedDelivery: "30-40 min" },
      });
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
          currentLocation: { lat: 28.61 + Math.random() * 0.01, lng: 77.23 + Math.random() * 0.01 },
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
