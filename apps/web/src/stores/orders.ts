import { create } from "zustand";
import type { OrderStatus, ServerType, TimingType } from "@routebite/shared/types";
import {
  getOrders,
  getOrder,
  deleteOrder,
  postOrder,
} from "../lib/api";

export interface Order {
  id: string;
  swiggyOrderId?: string;
  server: ServerType;
  status: OrderStatus;
  totalAmount: number;
  timingType: TimingType;
  interceptAddress?: string;
  placedAt?: string;
  autoPlaceAt?: string;
  createdAt?: string;
  journeyId?: string;
  interceptId?: string;
}

interface OrdersState {
  all: Order[];
  active: Order | null;
  loading: boolean;
  error: string | null;
  setAll: (o: Order[]) => void;
  setActive: (o: Order | null) => void;
  fetchOrders: () => Promise<void>;
  fetchOrder: (id: string) => Promise<void>;
  cancelOrder: (id: string) => Promise<void>;
  placeOrder: (params: Parameters<typeof postOrder>[0]) => Promise<Order>;
}

export const useOrders = create<OrdersState>((set, get) => ({
  all: [],
  active: null,
  loading: false,
  error: null,
  setAll: (all) => set({ all }),
  setActive: (active) => set({ active }),
  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await getOrders();
      set({ all: orders, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  fetchOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const order = await getOrder(id);
      set({ active: order, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  cancelOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteOrder(id);
      set((s) => ({ all: s.all.filter((o) => o.id !== id), loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  placeOrder: async (params) => {
    set({ loading: true, error: null });
    try {
      const order = await postOrder(params);
      set((s) => ({ all: [order, ...s.all], loading: false }));
      return order;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },
}));
