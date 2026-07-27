import { useCallback, useEffect, useRef, useLayoutEffect, useState } from "react";
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
  Ticket,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  FileText,
} from "lucide-react";
import type { ServerType, TimingType } from "@routebite/shared/types";
import { toast } from "sonner";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { previewCheckout, planOrderHopPack, getHaltGate, getMealHint, placeMultiHopOrders, type CheckoutPreview } from "~/lib/api";
import { useJourney } from "../stores/journey";
import { useCart } from "../stores/cart";
import { useOrders } from "../stores/orders";
import { Button } from "~/components/ui/button";
import { HaltGateAlert, HopPackSummary } from "~/components/fusion/FusionPanels";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";

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
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [haltGate, setHaltGate] = useState<Awaited<ReturnType<typeof getHaltGate>> | null>(null);
  const [mealHint, setMealHint] = useState<string | null>(null);
  const [hopPlan, setHopPlan] = useState<Awaited<ReturnType<typeof planOrderHopPack>> | null>(null);

  useLayoutEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".order-step", { y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: "expo.out" });
    }, ref);
    return () => ctx.revert();
  }, []);

  const buildPreviewBody = useCallback(() => {
    const body: Parameters<typeof previewCheckout>[0] = {
      interceptId,
      server,
      couponCode,
      paymentMethod,
    };
    if (server === "food" && cart.restaurantId) {
      body.restaurantId = cart.restaurantId;
      body.restaurantName = cart.restaurantName ?? undefined;
      body.foodItems = cart.items.map((i) => ({
        menuItemId: i.id,
        quantity: i.quantity,
        variantId: i.variantId,
        addonIds: i.addonIds ?? [],
      }));
    } else if (server === "instamart") {
      body.productItems = cart.items.map((i) => ({
        productId: i.id,
        variantId: i.spinId ?? i.variantId ?? i.id,
        quantity: i.quantity,
      }));
    }
    return body;
  }, [cart, couponCode, interceptId, paymentMethod, server]);

  const refreshPreview = useCallback(async () => {
    if (!interceptId || cart.items.length === 0) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await previewCheckout(buildPreviewBody());
      setPreview(data);
      setPaymentMethod(data.selectedPaymentMethod);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to load Swiggy cart");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [buildPreviewBody, cart.items.length, interceptId]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  useEffect(() => {
    if (!interceptId) return;
    void getHaltGate(interceptId)
      .then(setHaltGate)
      .catch(() => setHaltGate(null));
    void getMealHint(interceptId, server)
      .then((h) => setMealHint(h.hint))
      .catch(() => setMealHint(null));
    void planOrderHopPack(
      cart.items.map((i) => ({
        id: i.id,
        name: i.name,
        priceRupees: i.price,
        quantity: i.quantity,
        server,
      }))
    )
      .then(setHopPlan)
      .catch(() => setHopPlan(null));
  }, [cart.items, interceptId, server]);

  if (!current || !interceptId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="glass rounded-2xl p-10">
          <MapPin className="mx-auto mb-4 h-10 w-10 text-text-muted" />
          <h2 className="mb-2 text-xl font-bold">No journey found</h2>
          <p className="mb-4 text-sm text-text-muted">Plan a route first to place an order.</p>
          <button
            type="button"
            onClick={() => navigate("/routes/new")}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-bold text-void hover:bg-amber-light"
          >
            Plan Route
          </button>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="glass rounded-2xl p-10">
          <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-text-muted" />
          <h2 className="mb-2 text-xl font-bold">Your cart is empty</h2>
          <p className="mb-4 text-sm text-text-muted">Browse the menu and add items first.</p>
          <button
            type="button"
            onClick={() => navigate(`/menu?interceptsId=${interceptId}&server=${server}`)}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-bold text-void hover:bg-amber-light"
          >
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  const displayTotal = preview?.total ?? cart.getTotal();
  const canPlace =
    Boolean(preview?.canPlace) &&
    addressConfirmed &&
    !previewLoading &&
    !placing &&
    !orderLoading;

  const handlePlaceOrder = async () => {
    if (!preview?.canPlace) {
      toast.error(preview?.violations.message ?? "Cart cannot be placed");
      return;
    }
    if (!addressConfirmed) {
      toast.error("Confirm the delivery address before placing");
      return;
    }
    setPlacing(true);
    try {
      const needsMultiHop =
        hopPlan != null &&
        (hopPlan.foodHops.length > 1 || hopPlan.instamartHops.length > 1) &&
        current.intercepts &&
        current.intercepts.length > 1;

      if (needsMultiHop) {
        const sortedStops = [...(current.intercepts ?? [])].sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0)
        );
        const hops: Parameters<typeof placeMultiHopOrders>[0]["hops"] = [];
        hopPlan!.foodHops.forEach((h, i) => {
          const stop = sortedStops[i] ?? sortedStops[0];
          if (!stop || server !== "food" || !cart.restaurantId) return;
          hops.push({
            interceptId: stop.id,
            server: "food",
            timing,
            restaurantId: cart.restaurantId,
            paymentMethod,
            couponCode: i === 0 ? couponCode : undefined,
            foodItems: h.lines.map((l) => ({
              menuItemId: l.id,
              quantity: l.quantity,
              addonIds: [],
            })),
          });
        });
        hopPlan!.instamartHops.forEach((h, i) => {
          const stop =
            sortedStops[hopPlan!.foodHops.length + i] ?? sortedStops[sortedStops.length - 1];
          if (!stop || server !== "instamart") return;
          hops.push({
            interceptId: stop.id,
            server: "instamart",
            timing,
            paymentMethod,
            productItems: h.lines.map((l) => ({
              productId: l.id,
              variantId: l.id,
              quantity: l.quantity,
            })),
          });
        });
        if (hops.length > 1) {
          const res = await placeMultiHopOrders({ journeyId: current.id, hops });
          cart.clearCart();
          toast.success(`Queued ${res.hopCount} hop orders along your corridor`);
          navigate("/orders");
          return;
        }
      }

      const body: Parameters<typeof placeOrder>[0] = {
        journeyId: current.id,
        interceptId,
        server,
        timing,
        paymentMethod,
        couponCode,
      };

      if (server === "food" && cart.restaurantId) {
        body.restaurantId = cart.restaurantId;
        body.foodItems = cart.items.map((i) => ({
          menuItemId: i.id,
          quantity: i.quantity,
          variantId: i.variantId,
          addonIds: i.addonIds ?? [],
        }));
      } else if (server === "instamart") {
        body.productItems = cart.items.map((i) => ({
          productId: i.id,
          variantId: i.spinId ?? i.variantId ?? i.id,
          quantity: i.quantity,
        }));
      }

      await placeOrder(body);
      cart.clearCart();
      toast.success(
        server === "food" ? "Swiggy order placed successfully" : "Instamart order placed successfully"
      );
      navigate("/orders");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Order failed");
      setPlacing(false);
    }
  };

  const intercept = current.intercepts?.find((i) => i.id === interceptId);

  return (
    <div ref={ref} className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6">
      <div className="order-step mb-8">
        <PageHeader
          eyebrow="Checkout"
          title="Confirm & time"
          description="Review Swiggy cart, payment method, address, and caps before placing."
        />
      </div>

      {previewError && (
        <div className="order-step mb-4 flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-xs text-rose">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{previewError}</span>
        </div>
      )}

      {preview?.violations.message && (
        <div className="order-step mb-4 flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-xs text-amber">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{preview.violations.message}</span>
        </div>
      )}

      <div className="order-step mb-4 flex flex-col gap-3">
        {mealHint && (
          <Alert className="border-amber/20 bg-amber/5">
            <Sparkles />
            <AlertTitle>Meal priming</AlertTitle>
            <AlertDescription>{mealHint}</AlertDescription>
          </Alert>
        )}
        <HaltGateAlert gate={haltGate} />
        <HopPackSummary plan={hopPlan} />
        {current.vehicleDetails && (
          <Alert className="border-border-subtle">
            <FileText />
            <AlertTitle>Delivery semantics (rider brief)</AlertTitle>
            <AlertDescription className="text-xs">
              {[
                current.vehicleDetails.description,
                current.vehicleDetails.plateNumber
                  ? `Plate ${current.vehicleDetails.plateNumber}`
                  : null,
                current.vehicleDetails.color,
                current.vehicleDetails.busOperator,
                current.vehicleDetails.busRouteNumber
                  ? `Route ${current.vehicleDetails.busRouteNumber}`
                  : null,
                current.vehicleDetails.coach
                  ? `Coach ${current.vehicleDetails.coach}`
                  : null,
                current.vehicleDetails.trainNumber
                  ? `Train ${current.vehicleDetails.trainNumber}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Vehicle profile will be attached as Swiggy landmark notes."}
            </AlertDescription>
          </Alert>
        )}
        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <Label htmlFor="timing-auto" className="text-sm font-bold">
              Deferred auto-place
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Hold cart until Maps-timed place (Swiggy has no schedule API)
            </p>
          </div>
          <Switch
            id="timing-auto"
            checked={timing === "auto"}
            onCheckedChange={(on) => setTiming(on ? "auto" : "now")}
          />
        </div>
      </div>

      <div className="order-step glass mb-6 rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/10">
            {server === "food" ? (
              <ChefHat className="h-5 w-5 text-amber" />
            ) : (
              <ShoppingBag className="h-5 w-5 text-amber" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold">
              {server === "food" ? (cart.restaurantName ?? "Swiggy Food") : "Swiggy Instamart"}
            </div>
            <div className="text-xs text-text-muted">
              {cart.items.length} items — ₹{displayTotal.toFixed(2)}
              {previewLoading && " · syncing…"}
            </div>
          </div>
        </div>
        {intercept && (
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <MapPin className="h-3 w-3" />
            {intercept.type} stop — {intercept.dwellTime} min dwell
          </div>
        )}
      </div>

      {/* Address confirmation */}
      <div className="order-step glass mb-6 rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-bold">Delivery address</h3>
        {preview?.address ? (
          <>
            <p className="text-xs font-medium text-amber">{preview.address.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{preview.address.formatted}</p>
            <p className="mt-1 text-[11px] text-text-muted">
              {preview.address.city}
              {preview.address.postalCode ? ` · ${preview.address.postalCode}` : ""} · id{" "}
              {preview.addressId.slice(0, 12)}…
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={addressConfirmed}
                onChange={(e) => setAddressConfirmed(e.target.checked)}
              />
              <span>
                Deliver to this address
                {timing === "now" ? " now" : " when auto-timed"}? (required before place)
              </span>
            </label>
          </>
        ) : (
          <p className="text-xs text-text-muted">
            {previewLoading ? "Resolving intercept address…" : "Address unavailable"}
          </p>
        )}
      </div>

      {/* Cart items */}
      <div className="order-step glass mb-6 rounded-2xl p-5">
        <h3 className="mb-4 text-sm font-bold">Cart items</h3>
        <div className="space-y-3">
          {cart.items.map((item) => (
            <div
              key={`${item.id}-${item.variantId ?? ""}-${(item.addonIds ?? []).join()}`}
              className="flex items-center gap-3 rounded-xl bg-surface-raised p-3"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-elevated">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                ) : server === "food" ? (
                  <ChefHat className="h-4 w-4 text-text-muted" />
                ) : (
                  <ShoppingBag className="h-4 w-4 text-text-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{item.name}</div>
                <div className="text-xs text-text-muted">
                  ₹{item.price}
                  {item.variantName ? ` · ${item.variantName}` : ""}
                  {item.addonNames?.length ? ` · ${item.addonNames.join(", ")}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated hover:bg-amber/20"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated hover:bg-amber/20"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="min-w-[60px] text-right text-sm font-bold">
                ₹{(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4">
          <span className="text-sm text-text-muted">Swiggy total</span>
          <span className="text-lg font-bold">₹{displayTotal.toFixed(2)}</span>
        </div>
        {preview && (
          <p className="mt-1 text-[11px] text-text-muted">
            Cap ₹{preview.caps.foodMaxRupees}
            {server === "instamart" ? ` · Min ₹${preview.caps.instamartMinRupees}` : ""}
          </p>
        )}
      </div>

      {/* Coupons (Food) */}
      {server === "food" && (
        <div className="order-step glass mb-6 rounded-2xl p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Ticket className="size-4 text-amber" />
            Coupons (COD only)
          </h3>
          <p className="mb-3 text-[11px] text-text-muted">
            Builders Club v1 filters out online-payment-only offers.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCouponCode(undefined)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                !couponCode ? "border-amber bg-amber/10 text-amber" : "border-border-subtle text-text-muted"
              }`}
            >
              None
            </button>
            {(preview?.coupons ?? []).map((c) => {
              const code = String(c.code ?? "");
              if (!code) return null;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCouponCode(code)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs ${
                    couponCode === code
                      ? "border-amber bg-amber/10 text-amber"
                      : "border-border-subtle text-text-secondary hover:border-border-medium"
                  }`}
                >
                  <span className="font-bold">{code}</span>
                  {c.description ? (
                    <span className="mt-0.5 block text-[10px] opacity-80">{c.description}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {preview?.appliedCoupon && (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald">
              <CheckCircle2 className="size-3.5" />
              Applied {String((preview.appliedCoupon as { code?: string }).code ?? couponCode)}
            </p>
          )}
        </div>
      )}

      {/* Payment methods from get_*_cart */}
      <div className="order-step glass mb-6 rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-bold">Payment method</h3>
        <p className="mb-3 text-[11px] text-text-muted">
          Only methods returned by Swiggy cart (`availablePaymentMethods`).
        </p>
        <div className="flex flex-wrap gap-2">
          {(preview?.availablePaymentMethods ?? ["COD"]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                paymentMethod === m
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-border-subtle text-text-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div className="order-step glass mb-6 rounded-2xl p-5">
        <h3 className="mb-4 text-sm font-bold">When should we place this order?</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTiming("now")}
            className={`flex flex-col items-center gap-3 rounded-xl border p-5 transition-all ${
              timing === "now"
                ? "border-amber bg-amber/10 text-amber"
                : "border-border-subtle bg-surface-raised text-text-muted hover:border-border-medium hover:text-text-primary"
            }`}
          >
            <Zap className="h-6 w-6" />
            <div className="text-center">
              <div className="text-sm font-bold">Order now</div>
              <div className="mt-0.5 text-[10px] opacity-70">Place immediately</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setTiming("auto")}
            className={`flex flex-col items-center gap-3 rounded-xl border p-5 transition-all ${
              timing === "auto"
                ? "border-amber bg-amber/10 text-amber"
                : "border-border-subtle bg-surface-raised text-text-muted hover:border-border-medium hover:text-text-primary"
            }`}
          >
            <Clock className="h-6 w-6" />
            <div className="text-center">
              <div className="text-sm font-bold">Auto-timed</div>
              <div className="mt-0.5 text-[10px] opacity-70">Syncs with arrival</div>
            </div>
          </button>
        </div>
      </div>

      <div className="order-step mb-3 flex justify-end">
        <Button variant="outline" size="sm" disabled={previewLoading} onClick={() => void refreshPreview()}>
          {previewLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh Swiggy cart"}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => void handlePlaceOrder()}
        disabled={!canPlace}
        className="order-step flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-6 py-4 text-sm font-bold text-void shadow-lg shadow-amber/20 transition-all hover:bg-amber-light disabled:cursor-not-allowed disabled:opacity-40"
      >
        {placing || orderLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            {timing === "auto" ? "Auto-place order" : "Place order now"} — ₹{displayTotal.toFixed(2)}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
