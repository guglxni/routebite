import { Hono } from "hono";
import { requireAuth } from "./auth.js";
import { instamartProducts, imCarts, ensureImCart, ensureOrders, ensureAddresses, generateOrderId } from "./data.js";
import { parseToolCall } from "./mcp.js";

export const instamartRouter = new Hono();

function sessionId(c: any) {
  const auth = c.req.header("Authorization");
  return auth?.replace("Bearer ", "") ?? "anon";
}

instamartRouter.use(async (c, next) => {
  if (!requireAuth(c)) {
    return c.json({ success: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  await next();
});

instamartRouter.post("/*", async (c) => {
  const { tool, params } = await parseToolCall(c, "instamart");
  const bodyAny = params as Record<string, any>;
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

    case "search_instamart_products": {
      const { query } = bodyAny;
      let results = [...instamartProducts];
      if (query) {
        const q = query.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
      }
      return c.json({ success: true, data: { products: results, total: results.length } });
    }

    case "update_instamart_cart": {
      const { items: newItems } = bodyAny;
      const cart = ensureImCart(sid);
      newItems.forEach((it: any) => {
        const existing = cart.items.find((ci: any) => ci.productId === it.productId);
        if (existing) {
          existing.quantity = it.quantity || 1;
        } else {
          cart.items.push({ productId: it.productId, name: it.name, variant: it.variant, price: it.price, quantity: it.quantity || 1 });
        }
      });
      return c.json({ success: true, data: { items: cart.items } });
    }

    case "get_instamart_cart": {
      const cart = ensureImCart(sid);
      const enriched = cart.items.map((ci: any) => {
        const prod = instamartProducts.find(p => p.id === ci.productId);
        return { ...ci, name: prod?.name || ci.name, variant: ci.variant || prod?.variant, price: prod?.price || ci.price || 0 };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + (i.price || 0) * i.quantity, 0);
      const deliveryFee = subtotal > 0 ? 25 : 0;
      const platformFee = subtotal > 0 ? 5 : 0;
      const total = subtotal + deliveryFee + platformFee;
      return c.json({
        success: true,
        data: { items: enriched, subtotal, deliveryFee, platformFee, total },
      });
    }

    case "place_instamart_order": {
      const { paymentMethod = "COD" } = bodyAny;
      const cart = ensureImCart(sid);
      const enriched = cart.items.map((ci: any) => {
        const prod = instamartProducts.find(p => p.id === ci.productId);
        return { ...ci, name: prod?.name || ci.name, price: prod?.price || ci.price || 0 };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + (i.price || 0) * i.quantity, 0);
      const total = subtotal + 25 + 5;

      if (total < 99) {
        return c.json({ success: false, error: { message: "Minimum order value is ₹99", code: "MIN_ORDER_NOT_MET" } }, 400);
      }
      if (total === 0 || enriched.length === 0) {
        return c.json({ success: false, error: { message: "Cart is empty", code: "EMPTY_CART" } }, 400);
      }

      const orderId = generateOrderId();
      const order = {
        orderId,
        items: enriched,
        total,
        paymentMethod,
        status: "PLACED",
        placedAt: new Date().toISOString(),
        deliveryEta: "20-30 min",
      };

      const ords = ensureOrders(sid);
      ords.unshift(order);

      // Flush cart
      imCarts.set(sid, { items: [] });

      return c.json({
        success: true,
        data: { orderId, status: "PLACED", total, estimatedDelivery: "20-30 min" },
      });
    }

    case "get_instamart_orders": {
      const ords = ensureOrders(sid);
      return c.json({ success: true, data: { orders: ords.filter((o: any) => o.items?.[0]?.productId).slice(0, 20) } });
    }

    case "get_instamart_order_details": {
      const { orderId } = bodyAny;
      const ords = ensureOrders(sid);
      const order = ords.find((o: any) => o.orderId === orderId);
      if (!order) return c.json({ success: false, error: { message: "Order not found", code: "ORDER_NOT_FOUND" } }, 404);
      return c.json({ success: true, data: order });
    }

    case "track_instamart_order": {
      const { orderId } = bodyAny;
      const ords = ensureOrders(sid);
      const order = ords.find((o: any) => o.orderId === orderId);
      if (!order) return c.json({ success: false, error: { message: "Order not found", code: "ORDER_NOT_FOUND" } }, 404);

      const statuses = ["PLACED", "CONFIRMED", "PICKING", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
      const currentIdx = statuses.indexOf(order.status);
      const now = Date.now();
      const placedAt = new Date(order.placedAt).getTime();
      const elapsed = Math.floor((now - placedAt) / 1000);

      let status = order.status;
      if (elapsed > 0) status = statuses[Math.min(currentIdx + Math.floor(elapsed / 15), statuses.length - 1)];

      return c.json({
        success: true,
        data: {
          orderId,
          status,
          statusText: status.replace(/_/g, " "),
          deliveryPartner: { name: "Ajay S.", phone: "+91-97654-32101", vehicle: "Hero Splendor (DL4S XY 5678)" },
          currentLocation: { lat: 28.61 + Math.random() * 0.01, lng: 77.23 + Math.random() * 0.01 },
          eta: status === "DELIVERED" ? "Delivered" : `${Math.max(5, 25 - Math.floor(elapsed / 60))} min`,
        },
      });
    }

    case "confirm_instamart_delivery": {
      const { orderId } = bodyAny;
      const ords = ensureOrders(sid);
      const order = ords.find((o: any) => o.orderId === orderId);
      if (!order) return c.json({ success: false, error: { message: "Order not found", code: "ORDER_NOT_FOUND" } }, 404);
      order.status = "DELIVERED";
      order.deliveredAt = new Date().toISOString();
      return c.json({ success: true, data: { orderId, status: "DELIVERED" } });
    }

    case "report_error": {
      return c.json({ success: true, data: { mailto: "mailto:security@swiggy.in", helpline: "080-67466729", summary: "Error reported" } });
    }

    default:
      return c.json({ success: false, error: { message: `Unknown tool: ${tool}`, code: "TOOL_NOT_FOUND" } }, 404);
  }
});
