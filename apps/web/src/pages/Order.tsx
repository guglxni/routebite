import { useRef, useLayoutEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ArrowRight,
  Clock,
  Zap,
  MapPin,
  Loader2,
  ChefHat,
  ShoppingBag,
  Minus,
  Plus,
} from "lucide-react";
import type { ServerType, TimingType } from "@routebite/shared/types";
import { useJourney } from "../stores/journey";
import { useCart } from "../stores/cart";
import { useOrders } from "../stores/orders";

export default function Order() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { current } = useJourney();
  const cart = useCart();
  const { placeOrder, loading: orderLoading } = useOrders();
  const ref = useRef<HTMLDivElement>(null);

  const interceptId = sp.get("interceptsId") ?? cart.interceptId ?? "";
  const server = (sp.get("server") as ServerType) ?? cart.server;

  const [timing, setTiming] = useState<TimingType>("auto");
  const [placing, setPlacing] = useState(false);

  useLayoutEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".order-step", { y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: "expo.out" });
    }, ref);
    return () => ctx.revert();
  }, []);

  if (!current || !interceptId || interceptId === "") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="glass rounded-2xl p-10">
          <MapPin className="w-10 h-10 mx-auto mb-4 text-text-muted" />
          <h2 className="text-xl font-bold mb-2">No journey found</h2>
          <p className="text-sm text-text-muted mb-4">Plan a route first to place an order.</p>
          <button
            onClick={() => navigate("/routes/new")}
            className="px-4 py-2 bg-amber text-void rounded-lg text-sm font-bold hover:bg-amber-light transition-colors"
          >
            Plan Route
          </button>
        </div>
      </div>
    );
  }

  // If cart is empty, redirect to menu
  if (cart.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="glass rounded-2xl p-10">
          <ShoppingBag className="w-10 h-10 mx-auto mb-4 text-text-muted" />
          <h2 className="text-xl font-bold mb-2">Your cart is empty</h2>
          <p className="text-sm text-text-muted mb-4">Browse the menu and add items first.</p>
          <button
            onClick={() => navigate(`/menu?interceptsId=${interceptId}&server=${server}`)}
            className="px-4 py-2 bg-amber text-void rounded-lg text-sm font-bold hover:bg-amber-light transition-colors"
          >
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  const handlePlaceOrder = async () => {
    setPlacing(true);
    try {
      const body: Parameters<typeof placeOrder>[0] = {
        journeyId: current.id,
        interceptId,
        server,
        timing,
      };

      if (server === "food" && cart.restaurantId) {
        body.restaurantId = cart.restaurantId;
        body.foodItems = cart.items.map((i) => ({
          menuItemId: i.id,
          quantity: i.quantity,
          addonIds: [],
        }));
      } else if (server === "instamart") {
        body.productItems = cart.items.map((i) => ({
          productId: i.id,
          variantId: "default",
          quantity: i.quantity,
        }));
      }

      await placeOrder(body);
      cart.clearCart();
      navigate("/orders");
    } catch {
      setPlacing(false);
    }
  };

  const intercept = current?.intercepts?.find((i) => i.id === interceptId);

  return (
    <div ref={ref} className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="order-step mb-8">
        <h1 className="text-3xl font-extrabold mb-2">Place your order</h1>
        <p className="text-text-secondary">Review your cart and set delivery timing.</p>
      </div>

      {/* Provider summary */}
      <div className="order-step glass rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber/10 flex items-center justify-center">
            {server === "food" ? (
              <ChefHat className="w-5 h-5 text-amber" />
            ) : (
              <ShoppingBag className="w-5 h-5 text-amber" />
            )}
          </div>
          <div>
            <div className="font-bold text-sm">
              {server === "food" ? (cart.restaurantName ?? "Swiggy Food") : "Swiggy Instamart"}
            </div>
            <div className="text-xs text-text-muted">
              {cart.items.length} items — Rs. {cart.getTotal().toFixed(2)}
            </div>
          </div>
        </div>
        {intercept && (
          <div className="text-xs text-text-muted flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {intercept.type} Stop — {intercept.dwellTime} min dwell
          </div>
        )}
      </div>

      {/* Cart items */}
      <div className="order-step glass rounded-2xl p-5 mb-6">
        <h3 className="font-bold text-sm mb-4">Cart Items</h3>
        <div className="space-y-3">
          {cart.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised"
            >
              <div className="w-12 h-12 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0 overflow-hidden">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : server === "food" ? (
                  <ChefHat className="w-4 h-4 text-text-muted" />
                ) : (
                  <ShoppingBag className="w-4 h-4 text-text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{item.name}</div>
                <div className="text-xs text-text-muted">Rs. {item.price} each</div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}
                  className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center hover:bg-amber/20 transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                <button
                  onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
                  className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center hover:bg-amber/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="text-sm font-bold text-right min-w-[60px]">
                Rs. {(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-subtle">
          <span className="text-sm text-text-muted">Subtotal</span>
          <span className="text-lg font-bold">Rs. {cart.getTotal().toFixed(2)}</span>
        </div>
      </div>

      {/* Timing selector */}
      <div className="order-step glass rounded-2xl p-5 mb-6">
        <h3 className="font-bold text-sm mb-4">When should we place this order?</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTiming("now")}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border transition-all ${
              timing === "now"
                ? "border-amber bg-amber/10 text-amber"
                : "border-border-subtle bg-surface-raised text-text-muted hover:text-text-primary hover:border-border-medium"
            }`}
          >
            <Zap className="w-6 h-6" />
            <div className="text-center">
              <div className="font-bold text-sm">Order Now</div>
              <div className="text-[10px] mt-0.5 opacity-70">Place immediately</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setTiming("auto")}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border transition-all ${
              timing === "auto"
                ? "border-amber bg-amber/10 text-amber"
                : "border-border-subtle bg-surface-raised text-text-muted hover:text-text-primary hover:border-border-medium"
            }`}
          >
            <Clock className="w-6 h-6" />
            <div className="text-center">
              <div className="font-bold text-sm">Auto-Timed</div>
              <div className="text-[10px] mt-0.5 opacity-70">Syncs with arrival</div>
            </div>
          </button>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handlePlaceOrder}
        disabled={placing || orderLoading || cart.items.length === 0}
        className="order-step w-full flex items-center justify-center gap-2 px-6 py-4 bg-amber text-void rounded-xl font-bold text-sm hover:bg-amber-light transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber/20"
      >
        {placing || orderLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            {timing === "auto" ? "Auto-Place Order" : "Place Order Now"} — Rs.{" "}
            {cart.getTotal().toFixed(2)}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}
