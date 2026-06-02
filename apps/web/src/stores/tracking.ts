import { create } from "zustand";
import type { OrderStatus, VehicleDetails } from "@routebite/shared/types";
import { getOrderTrack, getOrderTrackingHistory } from "../lib/api";

export interface CustomerContext {
  transportMode: string;
  vehicleDetails: VehicleDetails;
  riderBrief: string;
  intercept: {
    id: string;
    lat: number;
    lng: number;
    name?: string;
    address?: string;
  };
  liveLocationSharing: boolean;
  liveLocation?: { lat: number; lng: number; accuracy?: number; timestamp: number };
  customerPosition?: { lat: number; lng: number };
  customerETA?: number;
}

export interface TrackingSnapshot {
  orderId: string;
  status: OrderStatus;
  swiggyOrderId: string | null;
  customerETA?: number;
  riderETA?: number;
  riderPosition?: { lat: number; lng: number };
  customerContext?: CustomerContext | null;
  alignmentStatus: {
    status: string;
    color: string;
    customerETA: number;
    riderETA: number;
    orderReadyTime: number;
    recommendation?: string;
    score: number;
  } | null;
  raw?: unknown;
}

export interface TrackingEvent {
  id: number;
  orderId: string;
  riderLat?: number;
  riderLng?: number;
  customerETA?: number;
  riderETA?: number;
  alignmentScore?: number;
  recordedAt: string | null;
}

interface TrackingState {
  snapshot: TrackingSnapshot | null;
  history: TrackingEvent[];
  loading: boolean;
  error: string | null;
  polling: boolean;
  pollInterval: ReturnType<typeof setInterval> | null;
  setSnapshot: (s: TrackingSnapshot | null) => void;
  setHistory: (h: TrackingEvent[]) => void;
  fetchTrack: (orderId: string) => Promise<void>;
  fetchHistory: (orderId: string) => Promise<void>;
  startPolling: (orderId: string) => void;
  stopPolling: () => void;
}

const POLL_MS = 15_000; // 15s frontend poll

export const useTracking = create<TrackingState>((set, get) => ({
  snapshot: null,
  history: [],
  loading: false,
  error: null,
  polling: false,
  pollInterval: null,

  setSnapshot: (snapshot) => set({ snapshot }),
  setHistory: (history) => set({ history }),

  fetchTrack: async (orderId) => {
    set({ loading: true, error: null });
    try {
      const data = await getOrderTrack(orderId);
      set({ snapshot: data as TrackingSnapshot, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchHistory: async (orderId) => {
    try {
      const data = await getOrderTrackingHistory(orderId, 50);
      set({ history: data as TrackingEvent[] });
    } catch (e) {
      console.warn("Failed to load tracking history:", e);
    }
  },

  startPolling: (orderId) => {
    const existing = get().pollInterval;
    if (existing) clearInterval(existing);

    const interval = setInterval(() => {
      get().fetchTrack(orderId).catch(() => {
        // Suppress repeated errors; stale data is fine
      });
    }, POLL_MS);

    set({ polling: true, pollInterval: interval });
  },

  stopPolling: () => {
    const existing = get().pollInterval;
    if (existing) clearInterval(existing);
    set({ polling: false, pollInterval: null });
  },
}));
