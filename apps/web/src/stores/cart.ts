import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ServerType } from "@routebite/shared/types";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variantId?: string;
  variantName?: string;
  addonIds?: string[];
  addonNames?: string[];
  image?: string;
  /** Instamart spinId when different from product id */
  spinId?: string;
}

interface CartState {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  server: ServerType;
  interceptId: string | null;

  // Actions
  setRestaurant: (id: string, name: string, server: ServerType) => void;
  setInterceptId: (id: string) => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      restaurantName: null,
      items: [],
      server: "food",
      interceptId: null,

      setRestaurant: (restaurantId, restaurantName, server) =>
        set({ restaurantId, restaurantName, server, items: [] }),

      setInterceptId: (interceptId) => set({ interceptId }),

      addItem: (item) => {
        const existing = get().items.find(
          (i) =>
            i.id === item.id &&
            i.variantId === item.variantId &&
            (i.addonIds ?? []).join() === (item.addonIds ?? []).join()
        );
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.id === item.id &&
              i.variantId === item.variantId &&
              (i.addonIds ?? []).join() === (item.addonIds ?? []).join()
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          });
        } else {
          set({ items: [...get().items, { ...item, quantity: 1 }] });
        }
      },

      removeItem: (id) =>
        set({ items: get().items.filter((i) => i.id !== id) }),

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== id) });
        } else {
          set({
            items: get().items.map((i) =>
              i.id === id ? { ...i, quantity } : i
            ),
          });
        }
      },

      clearCart: () =>
        set({ items: [], restaurantId: null, restaurantName: null }),

      getTotal: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

      getItemCount: () =>
        get().items.reduce((count, i) => count + i.quantity, 0),
    }),
    { name: "rb_cart" }
  )
);
