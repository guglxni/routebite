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
} from "lucide-react";
import type { ServerType } from "@routebite/shared/types";
import { getRestaurants, getRestaurantMenu, getProducts } from "../lib/api";
import { useCart } from "../stores/cart";
import { useJourney } from "../stores/journey";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Restaurant {
  id: string;
  name: string;
  cuisines: string[];
  rating?: number;
  deliveryTime?: string;
  costForTwo?: string;
  image?: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  isVeg?: boolean;
  image?: string;
  category?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Menu() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { current } = useJourney();
  const cart = useCart();

  const interceptId = sp.get("interceptsId") ?? "";
  const server = (sp.get("server") as ServerType) ?? "food";

  const ref = useRef<HTMLDivElement>(null);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Fetch restaurants/products on mount
  useEffect(() => {
    if (!interceptId) return;
    setLoading(true);
    setError(null);

    const fetch = async () => {
      try {
        if (server === "food") {
          const res = await getRestaurants(interceptId);
          const list = (res.restaurants ?? []).map((r: unknown) => {
            const raw = r as Record<string, unknown>;
            return {
              id: String(raw.id ?? ""),
              name: String(raw.name ?? "Restaurant"),
              cuisines: Array.isArray(raw.cuisines) ? raw.cuisines.map(String) : [],
              rating: typeof raw.rating === "number" ? raw.rating : undefined,
              deliveryTime: raw.deliveryTime ? String(raw.deliveryTime) : undefined,
              costForTwo: raw.costForTwo ? String(raw.costForTwo) : undefined,
              image: raw.image ? String(raw.image) : undefined,
            };
          });
          setRestaurants(list);
        } else {
          const res = await getProducts(interceptId);
          const list = (res.products ?? []).map((p: unknown) => {
            const raw = p as Record<string, unknown>;
            return {
              id: String(raw.id ?? ""),
              name: String(raw.name ?? "Product"),
              price: typeof raw.price === "number" ? raw.price : 0,
              image: raw.image ? String(raw.image) : undefined,
              category: raw.category ? String(raw.category) : undefined,
            };
          });
          setProducts(list);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [interceptId, server]);

  // Fetch menu when restaurant selected
  const handleSelectRestaurant = useCallback(async (r: Restaurant) => {
    setSelectedRestaurant(r);
    cart.setRestaurant(r.id, r.name, "food");
    cart.setInterceptId(interceptId);
    setLoading(true);
    try {
      const res = await getRestaurantMenu(interceptId, r.id);
      const list = (res.items ?? []).map((it: unknown) => {
        const raw = it as Record<string, unknown>;
        return {
          id: String(raw.id ?? ""),
          name: String(raw.name ?? "Item"),
          price: typeof raw.price === "number" ? raw.price : 0,
          description: raw.description ? String(raw.description) : undefined,
          isVeg: raw.isVeg === true,
          image: raw.image ? String(raw.image) : undefined,
          category: raw.category ? String(raw.category) : undefined,
        };
      });
      setMenuItems(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cart, interceptId]);

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
  }, [restaurants, products, menuItems]);

  const cartItemCount = cart.getItemCount();
  const cartTotal = cart.getTotal();

  // ─── Back button handler ──────────────────────────────────────────────────
  const handleBack = () => {
    if (selectedRestaurant && server === "food") {
      setSelectedRestaurant(null);
      setMenuItems([]);
    } else {
      navigate("/intercepts");
    }
  };

  // ─── Add / remove / update item in cart ────────────────────────────────────
  const addToCart = (item: MenuItem | Product) => {
    cart.addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
    });
  };

  const getQuantity = (id: string) => cart.items.find((i) => i.id === id)?.quantity ?? 0;

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
          <h1 className="text-2xl font-extrabold">
            {server === "food"
              ? selectedRestaurant
                ? selectedRestaurant.name
                : "Restaurants"
              : "Instamart"}
          </h1>
          <p className="text-xs text-text-muted flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {current?.destinationAddress ?? "Along your route"}
          </p>
        </div>
      </div>

      {/* ─── Food: Restaurant List ──────────────────────────────────────────── */}
      {server === "food" && !selectedRestaurant && (
        <div className="grid gap-4">
          {restaurants.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <ChefHat className="w-10 h-10 mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No restaurants found at this intercept.</p>
            </div>
          ) : (
            restaurants.map((r) => (
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
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-base truncate">{r.name}</h3>
                      {r.rating && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald/10 text-emerald text-xs font-bold">
                          <Star className="w-3 h-3 fill-emerald" />
                          {r.rating}
                        </div>
                      )}
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
                      {r.costForTwo && <span>{r.costForTwo}</span>}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted shrink-0 self-center" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Food: Menu Items ───────────────────────────────────────────────── */}
      {server === "food" && selectedRestaurant && (
        <div className="space-y-4">
          {menuItems.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <p className="text-sm text-text-muted">No menu items available.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {menuItems.map((item) => {
                const qty = getQuantity(item.id);
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
                      {qty === 0 ? (
                        <button
                          onClick={() => addToCart(item)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber text-void text-xs font-bold hover:bg-amber-light transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add
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
                            onClick={() => cart.updateQuantity(item.id, qty + 1)}
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
                        onClick={() => addToCart(p)}
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
                          onClick={() => cart.updateQuantity(p.id, qty + 1)}
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
