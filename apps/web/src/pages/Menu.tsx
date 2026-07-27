import { useRef, useLayoutEffect, useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ChefHat,
  ShoppingBag,
  Plus,
  Minus,
  ArrowLeft,
  ArrowRight,
  Star,
  Clock,
  MapPin,
  Loader2,
  X,
  IndianRupee,
  Search,
  Sparkles,
  Route,
} from "lucide-react";
import type { ServerType } from "@routebite/shared/types";
import { getRestaurants, getRestaurantMenu, getProducts, searchMenuDishes, getGoToItems, getMealHint } from "../lib/api";
import { useCart } from "../stores/cart";
import { useJourney, type InterceptReachability } from "../stores/journey";
import { JourneyMap } from "../components/map/JourneyMap";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Restaurant {
  id: string;
  name: string;
  cuisines: string[];
  rating?: number;
  deliveryTime?: string;
  costForTwo?: string;
  image?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  insideRiderIsochrone?: boolean;
  estimatedTravelSeconds?: number;
  riderTravelSeconds?: number;
  honesty?: {
    swiggyDistanceKm: number | null;
    mapsDistanceKm: number | null;
    mapsTravelMinutes: number | null;
    note: string;
  };
}

interface MenuVariant {
  id: string;
  name: string;
  price: number;
}

interface MenuAddon {
  id: string;
  name: string;
  price: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  isVeg?: boolean;
  image?: string;
  category?: string;
  variants?: MenuVariant[];
  addOns?: MenuAddon[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
  spinId?: string;
  variants?: Array<{ spinId: string; name: string; price: number }>;
}

function mapMenuItem(raw: Record<string, unknown>): MenuItem {
  const variants = Array.isArray(raw.variants)
    ? (raw.variants as Array<Record<string, unknown>>).map((v) => ({
        id: String(v.id ?? ""),
        name: String(v.name ?? "Option"),
        price: typeof v.price === "number" ? v.price : 0,
      }))
    : [];
  const addOns = Array.isArray(raw.addOns)
    ? (raw.addOns as Array<Record<string, unknown>>).map((a) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? "Add-on"),
        price: typeof a.price === "number" ? a.price : 0,
      }))
    : [];
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Item"),
    price: typeof raw.price === "number" ? raw.price : 0,
    description: raw.description ? String(raw.description) : undefined,
    isVeg: raw.isVeg === true,
    image: raw.image ? String(raw.image) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    variants,
    addOns,
  };
}

function mapProduct(raw: Record<string, unknown>): Product {
  const variants = Array.isArray(raw.variants)
    ? (raw.variants as Array<Record<string, unknown>>).map((v) => ({
        spinId: String(v.spinId ?? v.id ?? raw.id ?? ""),
        name: String(v.name ?? "Default"),
        price: typeof v.price === "number" ? v.price : typeof raw.price === "number" ? raw.price : 0,
      }))
    : undefined;
  const spinId = variants?.[0]?.spinId ?? String(raw.id ?? "");
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Product"),
    price: variants?.[0]?.price ?? (typeof raw.price === "number" ? raw.price : 0),
    image: raw.image ? String(raw.image) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    spinId,
    variants,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Menu() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { current, intercepts: journeyIntercepts } = useJourney();
  const cart = useCart();

  const interceptId = sp.get("interceptsId") ?? sp.get("interceptId") ?? "";
  const activeIntercept = journeyIntercepts.find((i) => i.id === interceptId);
  const server = (sp.get("server") as ServerType) ?? "food";

  const ref = useRef<HTMLDivElement>(null);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [reachability, setReachability] = useState<InterceptReachability | null>(null);
  const [inZoneOnly, setInZoneOnly] = useState(false);
  const [dishQuery, setDishQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [goToProducts, setGoToProducts] = useState<Product[]>([]);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [pickedVariantId, setPickedVariantId] = useState<string | undefined>();
  const [pickedAddons, setPickedAddons] = useState<string[]>([]);
  const [mealHint, setMealHint] = useState<string | null>(null);
  const [mealQuery, setMealQuery] = useState<string>("food");
  const [deepenNote, setDeepenNote] = useState<string | null>(null);
  const [shrinkZone, setShrinkZone] = useState(true);
  const etaSeconds = activeIntercept?.etaSeconds ?? activeIntercept?.dwellTime ?? 900;

  const mapRestaurant = (raw: Record<string, unknown>): Restaurant => {
    const honesty = raw.honesty as Restaurant["honesty"] | undefined;
    return {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? "Restaurant"),
      cuisines: Array.isArray(raw.cuisine)
        ? raw.cuisine.map(String)
        : Array.isArray(raw.cuisines)
          ? raw.cuisines.map(String)
          : [],
      rating: typeof raw.rating === "number" ? raw.rating : undefined,
      deliveryTime: raw.deliveryTime ? String(raw.deliveryTime) : undefined,
      costForTwo: raw.costForTwo ? String(raw.costForTwo) : undefined,
      image: raw.image ? String(raw.image) : undefined,
      lat: typeof raw.lat === "number" ? raw.lat : undefined,
      lng: typeof raw.lng === "number" ? raw.lng : undefined,
      distanceKm: typeof raw.distanceKm === "number" ? raw.distanceKm : undefined,
      insideRiderIsochrone:
        typeof raw.insideRiderIsochrone === "boolean" ? raw.insideRiderIsochrone : undefined,
      estimatedTravelSeconds:
        typeof raw.estimatedTravelSeconds === "number" ? raw.estimatedTravelSeconds : undefined,
      riderTravelSeconds:
        typeof raw.riderTravelSeconds === "number" ? raw.riderTravelSeconds : undefined,
      honesty,
    };
  };

  // Fetch restaurants/products on mount
  useEffect(() => {
    if (!interceptId) return;
    setLoading(true);
    setError(null);

    const fetch = async () => {
      try {
        if (server === "food") {
          const hint = await getMealHint(interceptId, "food").catch(() => null);
          if (hint) {
            setMealHint(hint.hint);
            setMealQuery(hint.primaryQuery);
          }
          const res = await getRestaurants(interceptId, {
            q: hint?.primaryQuery ?? "food",
            customerEta: shrinkZone ? etaSeconds : undefined,
          });
          if (res.reachability) setReachability(res.reachability as InterceptReachability);
          if (res.deepen?.note) setDeepenNote(res.deepen.note);
          else setDeepenNote(null);
          if (res.mealHint?.hint) setMealHint(res.mealHint.hint);
          setRestaurants((res.restaurants ?? []).map((r) => mapRestaurant(r as Record<string, unknown>)));
        } else {
          const [res, goTo] = await Promise.all([
            getProducts(interceptId, "grocery"),
            getGoToItems(interceptId).catch(() => ({ products: [] as unknown[] })),
          ]);
          setProducts((res.products ?? []).map((p) => mapProduct(p as Record<string, unknown>)));
          setGoToProducts(
            (goTo.products ?? []).map((p) => mapProduct(p as Record<string, unknown>))
          );
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [interceptId, server, shrinkZone, etaSeconds]);

  // Fetch menu when restaurant selected
  const handleSelectRestaurant = useCallback(async (r: Restaurant) => {
    setSelectedRestaurant(r);
    cart.setRestaurant(r.id, r.name, "food");
    cart.setInterceptId(interceptId);
    setDishQuery("");
    setLoading(true);
    try {
      const res = await getRestaurantMenu(interceptId, r.id);
      setMenuItems((res.items ?? []).map((it) => mapMenuItem(it as Record<string, unknown>)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cart, interceptId]);

  const runDishSearch = async () => {
    if (!selectedRestaurant || !dishQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchMenuDishes(interceptId, dishQuery.trim(), selectedRestaurant.id);
      setMenuItems((res.items ?? []).map((it) => mapMenuItem(it as Record<string, unknown>)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  // For instamart: set intercept in cart
  const handleSetInstamartContext = useCallback(() => {
    cart.setInterceptId(interceptId);
  }, [cart, interceptId]);

  useEffect(() => {
    if (server === "instamart" && interceptId) {
      handleSetInstamartContext();
    }
  }, [server, interceptId, handleSetInstamartContext]);

  // Animations
  useLayoutEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".menu-card", { y: 30, opacity: 0, duration: 0.5, stagger: 0.08, ease: "expo.out" });
    }, ref);
    return () => ctx.revert();
  }, [restaurants, products, menuItems, goToProducts]);

  const cartItemCount = cart.getItemCount();
  const cartTotal = cart.getTotal();

  const handleBack = () => {
    if (selectedRestaurant && server === "food") {
      setSelectedRestaurant(null);
      setMenuItems([]);
      setDishQuery("");
    } else {
      navigate("/intercepts");
    }
  };

  const openCustomize = (item: MenuItem) => {
    if ((item.variants?.length ?? 0) > 0 || (item.addOns?.length ?? 0) > 0) {
      setCustomizeItem(item);
      setPickedVariantId(item.variants?.[0]?.id);
      setPickedAddons([]);
      return;
    }
    cart.addItem({ id: item.id, name: item.name, price: item.price, image: item.image });
  };

  const confirmCustomize = () => {
    if (!customizeItem) return;
    const variant = customizeItem.variants?.find((v) => v.id === pickedVariantId);
    const addons = (customizeItem.addOns ?? []).filter((a) => pickedAddons.includes(a.id));
    const price =
      (variant?.price ?? customizeItem.price) + addons.reduce((s, a) => s + a.price, 0);
    cart.addItem({
      id: customizeItem.id,
      name: customizeItem.name,
      price,
      image: customizeItem.image,
      variantId: variant?.id,
      variantName: variant?.name,
      addonIds: addons.map((a) => a.id),
      addonNames: addons.map((a) => a.name),
    });
    setCustomizeItem(null);
  };

  const addProduct = (p: Product) => {
    const v = p.variants?.[0];
    cart.addItem({
      id: p.id,
      name: p.name,
      price: v?.price ?? p.price,
      image: p.image,
      spinId: v?.spinId ?? p.spinId ?? p.id,
      variantId: v?.spinId ?? p.spinId ?? p.id,
      variantName: v?.name,
    });
  };

  const getQuantity = (id: string) =>
    cart.items.filter((i) => i.id === id).reduce((s, i) => s + i.quantity, 0);

  const handleCheckout = () => {
    setCartOpen(false);
    navigate(`/order?interceptsId=${interceptId}&server=${server}`);
  };

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading && restaurants.length === 0 && products.length === 0 && menuItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 className="w-8 h-8 text-amber animate-spin" />
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (error && restaurants.length === 0 && products.length === 0 && menuItems.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="glass rounded-2xl p-10 text-rose">
          <p className="text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-rose/10 text-rose rounded-lg text-sm font-bold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleBack}
          className="w-9 h-9 rounded-xl bg-surface-raised border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber">
            {server === "food" ? "Food" : "Instamart"}
          </p>
          <h1 className="font-display text-2xl leading-tight tracking-tight text-text-primary md:text-[1.85rem]">
            {server === "food"
              ? selectedRestaurant
                ? selectedRestaurant.name
                : "Nearby kitchens"
              : "Grab & go"}
          </h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
            <MapPin className="w-3 h-3" />
            {current?.destinationAddress ?? "Along your route"}
          </p>
        </div>
      </div>

      {/* ─── Food: Restaurant List ──────────────────────────────────────────── */}
      {server === "food" && !selectedRestaurant && (
        <div className="grid gap-4">
          {reachability?.isochroneOk && (
            <>
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-xs text-violet-200">
                <p className="font-semibold text-violet-100 mb-1">Rider reachability (two-wheeler)</p>
                Delivery partners are routed as <strong>TWO_WHEELER</strong>; the purple zone is a
                road-network isochrone (~
                {Math.round((reachability.riderBudgetSeconds ?? 0) / 60)} min) — not a circle. Green =
                short walk handoff.
                {typeof reachability.reachableRestaurantCount === "number" && (
                  <span className="block mt-1 text-violet-300/80">
                    {reachability.reachableRestaurantCount} kitchens inside the rider zone
                    {typeof reachability.circularRestaurantCount === "number" && (
                      <> · {reachability.circularRestaurantCount} in circular search</>
                    )}
                  </span>
                )}
              </div>
              {activeIntercept && (
                <JourneyMap
                  origin={
                    current
                      ? { lat: current.originLat, lng: current.originLng }
                      : null
                  }
                  destination={
                    current
                      ? { lat: current.destinationLat, lng: current.destinationLng }
                      : null
                  }
                  intercepts={[{ ...activeIntercept, reachability }]}
                  selectedInterceptId={interceptId}
                  reachability={reachability}
                  heightClassName="h-[280px]"
                  showArcs={false}
                  interactive={false}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInZoneOnly(false)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    !inZoneOnly
                      ? "bg-amber text-void"
                      : "border border-border-subtle text-text-muted hover:border-border-medium"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setInZoneOnly(true)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    inZoneOnly
                      ? "bg-violet-500 text-white"
                      : "border border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
                  }`}
                >
                  In zone only
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    id="shrink-zone"
                    checked={shrinkZone}
                    onCheckedChange={setShrinkZone}
                  />
                  <Label htmlFor="shrink-zone" className="text-[11px] text-muted-foreground">
                    Deepen as I approach
                  </Label>
                </div>
              </div>
              {mealHint && (
                <Alert className="border-amber/20 bg-amber/5">
                  <Sparkles />
                  <AlertTitle>Meal priming · {mealQuery}</AlertTitle>
                  <AlertDescription>{mealHint}</AlertDescription>
                </Alert>
              )}
              {deepenNote && (
                <Alert>
                  <Route />
                  <AlertTitle>Isochrone deepening</AlertTitle>
                  <AlertDescription>{deepenNote}</AlertDescription>
                </Alert>
              )}
            </>
          )}
          {!reachability?.isochroneOk && restaurants.length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-surface-raised/40 px-4 py-3 text-xs text-text-muted">
              Reachability map unavailable — showing distance-ranked restaurants.
            </div>
          )}
          {restaurants.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <ChefHat className="w-10 h-10 mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No restaurants found at this intercept.</p>
            </div>
          ) : (
            (() => {
              const sorted = [...restaurants].sort((a, b) => {
                const ai = a.insideRiderIsochrone === true ? 1 : a.insideRiderIsochrone === false ? -1 : 0;
                const bi = b.insideRiderIsochrone === true ? 1 : b.insideRiderIsochrone === false ? -1 : 0;
                if (bi !== ai) return bi - ai;
                return (a.estimatedTravelSeconds ?? 9999) - (b.estimatedTravelSeconds ?? 9999);
              });
              const visible = inZoneOnly
                ? sorted.filter((r) => r.insideRiderIsochrone !== false)
                : sorted;
              const noneInZone =
                reachability?.isochroneOk &&
                sorted.some((r) => r.insideRiderIsochrone === true) === false &&
                sorted.length > 0;

              return (
                <>
                  {noneInZone && (
                    <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-xs text-rose">
                      None of these kitchens sit inside the rider zone — Far options are listed below.
                    </div>
                  )}
                  {inZoneOnly && visible.length === 0 && (
                    <div className="glass rounded-2xl p-8 text-center text-sm text-text-muted">
                      No in-zone restaurants. Turn off the filter to see farther options.
                    </div>
                  )}
                  {visible.map((r) => (
              <div
                key={r.id}
                onClick={() => handleSelectRestaurant(r)}
                className="menu-card glass rounded-2xl p-5 cursor-pointer hover:bg-surface-raised/60 transition-all border border-border-subtle hover:border-border-medium"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-surface-elevated shrink-0 flex items-center justify-center overflow-hidden">
                    {r.image ? (
                      <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <ChefHat className="w-6 h-6 text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <h3 className="font-bold text-base truncate">{r.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.insideRiderIsochrone === true && (
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 text-[10px] font-bold">
                            In zone
                          </span>
                        )}
                        {r.insideRiderIsochrone === false && (
                          <span className="px-2 py-0.5 rounded-md bg-rose/10 text-rose text-[10px] font-bold">
                            Far
                          </span>
                        )}
                        {r.rating && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald/10 text-emerald text-xs font-bold">
                            <Star className="w-3 h-3 fill-emerald" />
                            {r.rating}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-text-muted truncate mb-2">
                      {r.cuisines.join(" ")}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      {r.deliveryTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {r.deliveryTime}
                        </span>
                      )}
                      {typeof r.distanceKm === "number" && (
                        <span>{r.distanceKm.toFixed(1)} km</span>
                      )}
                      {(r.riderTravelSeconds ?? r.estimatedTravelSeconds) != null && (
                        <span>
                          ~{Math.round((r.riderTravelSeconds ?? r.estimatedTravelSeconds)! / 60)} min
                          rider
                        </span>
                      )}
                      {r.costForTwo && <span>{r.costForTwo}</span>}
                      {r.honesty && (
                        <HoverCard>
                          <HoverCardTrigger className="cursor-help text-sky-300 underline-offset-2 hover:underline">
                            Maps vs Swiggy
                          </HoverCardTrigger>
                          <HoverCardContent className="text-xs">
                            {r.honesty.note}
                          </HoverCardContent>
                        </HoverCard>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted shrink-0 self-center" />
                </div>
              </div>
                  ))}
                </>
              );
            })()
          )}
        </div>
      )}

      {/* ─── Food: Menu Items ───────────────────────────────────────────────── */}
      {server === "food" && selectedRestaurant && (
        <div className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runDishSearch();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                value={dishQuery}
                onChange={(e) => setDishQuery(e.target.value)}
                placeholder="Search dishes (search_menu)"
                className="w-full rounded-xl border border-border-subtle bg-surface-raised pl-10 pr-3 py-2.5 text-sm outline-none focus:border-amber"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !dishQuery.trim()}
              className="rounded-xl bg-amber px-4 py-2 text-xs font-bold text-void disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </button>
          </form>

          {menuItems.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <p className="text-sm text-text-muted">No menu items available.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {menuItems.map((item) => {
                const qty = getQuantity(item.id);
                const customizable =
                  (item.variants?.length ?? 0) > 0 || (item.addOns?.length ?? 0) > 0;
                return (
                  <div
                    key={item.id}
                    className="menu-card glass rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div className="w-20 h-20 rounded-xl bg-surface-elevated shrink-0 flex items-center justify-center overflow-hidden">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.isVeg ? (
                            <div className="w-6 h-6 rounded-full border-2 border-emerald flex items-center justify-center">
                              <div className="w-3 h-3 rounded-full bg-emerald" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-rose flex items-center justify-center">
                              <div className="w-3 h-3 rounded-full bg-rose" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-sm">{item.name}</h4>
                        {item.isVeg !== undefined && (
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              item.isVeg ? "bg-emerald" : "bg-rose"
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-xs text-text-muted truncate mb-2">
                        {item.description}
                      </p>
                      <div className="text-sm font-bold">Rs. {item.price}</div>
                    </div>
                    <div className="shrink-0">
                      {qty === 0 || customizable ? (
                        <button
                          onClick={() => openCustomize(item)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber text-void text-xs font-bold hover:bg-amber-light transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          {customizable ? "Customize" : "Add"}
                          {qty > 0 ? ` (${qty})` : ""}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-surface-raised rounded-lg p-1">
                          <button
                            onClick={() => cart.updateQuantity(item.id, qty - 1)}
                            className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center text-text-primary hover:bg-amber/20 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-5 text-center">{qty}</span>
                          <button
                            onClick={() => openCustomize(item)}
                            className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center text-text-primary hover:bg-amber/20 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Instamart: Product List ────────────────────────────────────────── */}
      {server === "instamart" && (
        <div className="space-y-6">
          {goToProducts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary">Your go-to items</h3>
              <p className="text-xs text-text-muted">From Instamart your_go_to_items</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {goToProducts.map((p) => {
                  const qty = getQuantity(p.id);
                  return (
                    <div key={`goto-${p.id}`} className="menu-card glass rounded-2xl p-4 flex flex-col border border-amber/20">
                      <div className="w-full aspect-square rounded-xl bg-surface-elevated mb-3 flex items-center justify-center overflow-hidden">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingBag className="w-8 h-8 text-text-muted" />
                        )}
                      </div>
                      <h4 className="font-bold text-sm mb-1 truncate flex-1">{p.name}</h4>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold">Rs. {p.price}</span>
                        <button
                          onClick={() => addProduct(p)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber text-void text-xs font-bold"
                        >
                          <Plus className="w-3 h-3" />
                          {qty > 0 ? qty : "Add"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center col-span-full">
                <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-text-muted" />
                <p className="text-sm text-text-muted">No products found at this intercept.</p>
              </div>
            ) : (
              products.map((p) => {
                const qty = getQuantity(p.id);
                return (
                  <div
                    key={p.id}
                    className="menu-card glass rounded-2xl p-4 flex flex-col"
                  >
                    <div className="w-full aspect-square rounded-xl bg-surface-elevated mb-3 flex items-center justify-center overflow-hidden">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingBag className="w-8 h-8 text-text-muted" />
                      )}
                    </div>
                    <h4 className="font-bold text-sm mb-1 truncate flex-1">{p.name}</h4>
                    <div className="text-xs text-text-muted mb-3">{p.category}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">Rs. {p.price}</span>
                      {qty === 0 ? (
                        <button
                          onClick={() => addProduct(p)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber text-void text-xs font-bold hover:bg-amber-light transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 bg-surface-raised rounded-lg p-0.5">
                          <button
                            onClick={() => cart.updateQuantity(p.id, qty - 1)}
                            className="w-6 h-6 rounded-md bg-surface-elevated flex items-center justify-center text-text-primary hover:bg-amber/20"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-4 text-center">{qty}</span>
                          <button
                            onClick={() => addProduct(p)}
                            className="w-6 h-6 rounded-md bg-surface-elevated flex items-center justify-center text-text-primary hover:bg-amber/20"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Customize dish modal */}
      {customizeItem && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setCustomizeItem(null)} />
          <div className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md glass-strong rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-base">{customizeItem.name}</h3>
                <p className="text-xs text-text-muted mt-1">Pick variants and add-ons</p>
              </div>
              <button type="button" onClick={() => setCustomizeItem(null)} className="p-1 text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            {(customizeItem.variants?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Variants</p>
                {customizeItem.variants!.map((v) => (
                  <label key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="variant"
                        checked={pickedVariantId === v.id}
                        onChange={() => setPickedVariantId(v.id)}
                      />
                      {v.name}
                    </span>
                    <span className="font-bold">Rs. {v.price}</span>
                  </label>
                ))}
              </div>
            )}
            {(customizeItem.addOns?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Add-ons</p>
                {customizeItem.addOns!.map((a) => (
                  <label key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pickedAddons.includes(a.id)}
                        onChange={() =>
                          setPickedAddons((prev) =>
                            prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                          )
                        }
                      />
                      {a.name}
                    </span>
                    <span className="font-bold">+Rs. {a.price}</span>
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={confirmCustomize}
              className="w-full rounded-xl bg-amber py-3 text-sm font-bold text-void"
            >
              Add to cart
            </button>
          </div>
        </>
      )}

      {/* ─── Floating Cart Bar ──────────────────────────────────────────────── */}
      {cartItemCount > 0 && (
        <>
          <button
            onClick={() => setCartOpen(!cartOpen)}
            className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-amber text-void flex items-center justify-center shadow-xl shadow-amber/30 hover:bg-amber-light transition-all"
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose text-white text-xs font-bold flex items-center justify-center">
              {cartItemCount}
            </span>
          </button>

          {/* Cart Drawer */}
          {cartOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                onClick={() => setCartOpen(false)}
              />
              <div className="fixed bottom-0 left-0 right-0 z-50 glass-strong rounded-t-2xl p-6 animate-[slideUp_0.3s_ease-out]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg">
                    Your Cart ({cartItemCount} items)
                  </h3>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="w-8 h-8 rounded-lg bg-surface-raised flex items-center justify-center text-text-muted hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-3 mb-4">
                  {cart.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised"
                    >
                      <div className="w-12 h-12 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <ShoppingBag className="w-4 h-4 text-text-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{item.name}</div>
                        <div className="text-xs text-text-muted">
                          Rs. {item.price} x {item.quantity}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center hover:bg-amber/20"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                        <button
                          onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center hover:bg-amber/20"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border-subtle pt-4 mb-4">
                  <span className="text-sm text-text-muted">Total</span>
                  <span className="text-xl font-bold">Rs. {cartTotal}</span>
                </div>
                <button
                  onClick={handleCheckout}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-amber text-void rounded-xl font-bold text-sm hover:bg-amber-light transition-all shadow-lg shadow-amber/20"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Slide-up animation keyframe (inline since @theme does not support keyframes) ─ */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
