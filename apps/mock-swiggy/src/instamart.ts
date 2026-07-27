import { Hono } from "hono";
import { requireAuth } from "./auth.js";
import {
  instamartProducts,
  imCarts,
  ensureImCart,
  ensureOrders,
  ensureAddresses,
  generateOrderId,
} from "./data.js";
import { parseToolCall, toolSuccess, toolFailure } from "./mcp.js";

/**
 * Mock Instamart MCP — tool names/params match Builders Club:
 * https://mcp.swiggy.com/builders/docs/reference/instamart/index.md
 * Live path: POST /im
 */
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
  const { tool, params, rpcId } = await parseToolCall(c, "instamart");
  const bodyAny = params as Record<string, any>;
  const sid = sessionId(c);
  const ok = (data: unknown, message?: string) => c.json(toolSuccess(data, message, rpcId));
  const fail = (message: string, code?: string, status: number = 400) => {
    const f = toolFailure(message, code, status, rpcId);
    return c.json(f.body, f.status as 400);
  };

  switch (tool) {
    case "get_addresses":
      return ok(ensureAddresses(sid));

    case "create_address": {
      const required = [
        "fullAddress",
        "addressLine",
        "addressLine2",
        "city",
        "postalCode",
        "latitude",
        "longitude",
        "addressCategory",
        "userName",
        "userPhone",
      ] as const;
      for (const key of required) {
        if (bodyAny[key] === undefined || bodyAny[key] === null) {
          return fail(`Missing required parameter: ${key}`, "VALIDATION_ERROR");
        }
      }
      const addrs = ensureAddresses(sid);
      const id = `addr_${addrs.length + 1}`;
      const newAddr = {
        id,
        addressId: id,
        label: bodyAny.addressTag || bodyAny.addressCategory || "OTHER",
        address: bodyAny.fullAddress,
        landmark: bodyAny.addressLine2,
        ...bodyAny,
      };
      addrs.push(newAddr);
      return ok(newAddr);
    }

    case "delete_address": {
      const { addressId } = bodyAny;
      const addrs = ensureAddresses(sid);
      const idx = addrs.findIndex((a: any) => a.id === addressId || a.addressId === addressId);
      if (idx < 0) return fail("Address not found", "NOT_FOUND", 404);
      addrs.splice(idx, 1);
      return ok({ deleted: addressId });
    }

    case "search_products": {
      if (!bodyAny.addressId || !bodyAny.query) {
        return fail("Missing required parameter: addressId and query", "VALIDATION_ERROR");
      }
      let results = [...instamartProducts];
      const q = String(bodyAny.query).toLowerCase();
      results = results.filter(
        (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
      );
      const products = results.map((p) => ({
        ...p,
        variants: [{ spinId: p.id, name: p.variant ?? "Default", price: p.price }],
      }));
      return ok({ products, total: products.length });
    }

    case "your_go_to_items": {
      if (!bodyAny.addressId) {
        return fail("Missing required parameter: addressId", "VALIDATION_ERROR");
      }
      const goTo = instamartProducts.slice(0, 5).map((p) => ({
        ...p,
        variants: [{ spinId: p.id, name: p.variant ?? "Default", price: p.price }],
      }));
      return ok({ products: goTo, total: goTo.length });
    }

    case "update_cart": {
      if (!bodyAny.selectedAddressId || !Array.isArray(bodyAny.items)) {
        return fail("Missing required parameter: selectedAddressId and items", "VALIDATION_ERROR");
      }
      const cart = ensureImCart(sid);
      cart.items = [];
      for (const it of bodyAny.items) {
        const spinId = it.spinId ?? it.productId;
        const prod = instamartProducts.find((p) => p.id === spinId);
        cart.items.push({
          productId: spinId,
          spinId,
          name: it.name ?? prod?.name,
          variant: it.variant ?? prod?.variant,
          price: it.price ?? prod?.price ?? 0,
          quantity: it.quantity || 1,
        });
      }
      return ok({ items: cart.items, selectedAddressId: bodyAny.selectedAddressId });
    }

    case "get_cart": {
      const cart = ensureImCart(sid);
      const enriched = cart.items.map((ci: any) => {
        const prod = instamartProducts.find((p) => p.id === (ci.spinId ?? ci.productId));
        return {
          ...ci,
          spinId: ci.spinId ?? ci.productId,
          name: prod?.name || ci.name,
          variant: ci.variant || prod?.variant,
          price: prod?.price || ci.price || 0,
        };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + (i.price || 0) * i.quantity, 0);
      const deliveryFee = subtotal > 0 ? 25 : 0;
      const platformFee = subtotal > 0 ? 5 : 0;
      return ok({
        items: enriched,
        subtotal,
        deliveryFee,
        platformFee,
        total: subtotal + deliveryFee + platformFee,
        availablePaymentMethods: ["COD"],
      });
    }

    case "clear_cart": {
      imCarts.set(sid, { items: [] });
      return ok({ items: [] });
    }

    case "checkout": {
      if (!bodyAny.addressId) {
        return fail("Missing required parameter: addressId", "VALIDATION_ERROR");
      }
      const paymentMethod = bodyAny.paymentMethod ?? "COD";
      const cart = ensureImCart(sid);
      const enriched = cart.items.map((ci: any) => {
        const prod = instamartProducts.find((p) => p.id === (ci.spinId ?? ci.productId));
        return { ...ci, name: prod?.name || ci.name, price: prod?.price || ci.price || 0 };
      });
      const subtotal = enriched.reduce((s: number, i: any) => s + (i.price || 0) * i.quantity, 0);
      const total = subtotal + 25 + 5;

      if (total < 99) return fail("Minimum order value is ₹99", "MIN_ORDER_NOT_MET");
      if (total === 0 || enriched.length === 0) return fail("Cart is empty", "EMPTY_CART");
      if (total >= 1000) return fail("Cart exceeds ₹1000 testing cap", "CART_LIMIT_EXCEEDED");

      const orderId = generateOrderId();
      ensureOrders(sid).unshift({
        orderId,
        items: enriched,
        total,
        paymentMethod,
        status: "PLACED",
        placedAt: new Date().toISOString(),
        deliveryEta: "20-30 min",
        server: "instamart",
        addressId: bodyAny.addressId,
      });
      imCarts.set(sid, { items: [] });
      return ok(
        { orderId, status: "PLACED", total, estimatedDelivery: "20-30 min" },
        "Instamart order placed successfully",
      );
    }

    case "get_orders": {
      const ords = ensureOrders(sid);
      return ok({
        orders: ords
          .filter((o: any) => o.server === "instamart" || o.items?.[0]?.productId || o.items?.[0]?.spinId)
          .slice(0, 20),
      });
    }

    case "get_order_details": {
      const order = ensureOrders(sid).find((o: any) => o.orderId === bodyAny.orderId);
      if (!order) return fail("Order not found", "ORDER_NOT_FOUND", 404);
      return ok(order);
    }

    case "track_order": {
      if (bodyAny.orderId == null || bodyAny.lat == null || bodyAny.lng == null) {
        return fail("Missing required parameter: orderId, lat, lng", "VALIDATION_ERROR");
      }
      const order = ensureOrders(sid).find((o: any) => o.orderId === bodyAny.orderId);
      if (!order) return fail("Order not found", "ORDER_NOT_FOUND", 404);

      const statuses = ["PLACED", "CONFIRMED", "PICKING", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
      const currentIdx = Math.max(0, statuses.indexOf(order.status));
      const elapsed = Math.floor((Date.now() - new Date(order.placedAt).getTime()) / 1000);
      let status = order.status;
      if (elapsed > 0) {
        status = statuses[Math.min(currentIdx + Math.floor(elapsed / 15), statuses.length - 1)];
      }

      return ok({
        orderId: bodyAny.orderId,
        status,
        statusText: status.replace(/_/g, " "),
        deliveryPartner: {
          name: "Ajay S.",
          phone: "+91-97654-32101",
          vehicle: "Hero Splendor (DL4S XY 5678)",
        },
        currentLocation: {
          lat: Number(bodyAny.lat) + (Math.random() - 0.5) * 0.01,
          lng: Number(bodyAny.lng) + (Math.random() - 0.5) * 0.01,
        },
        eta: status === "DELIVERED" ? "Delivered" : `${Math.max(5, 25 - Math.floor(elapsed / 60))} min`,
      });
    }

    case "report_error":
      return ok({
        mailto: "mailto:builders@swiggy.in",
        helpline: "080-67466729",
        summary: "Error reported",
      });

    default:
      return fail(`Unknown tool: ${tool}`, "TOOL_NOT_FOUND", 404);
  }
});
