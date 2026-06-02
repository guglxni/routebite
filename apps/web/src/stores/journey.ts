import { create } from "zustand";
import type { TransportMode } from "@routebite/shared/types";
import { postJourney, getIntercepts } from "../lib/api";

export interface Intercept {
  id: string;
  lat: number;
  lng: number;
  type: string;
  score: number;
  dwellTime: number;
  restaurantCount: number;
  safetyRating: number;
  name?: string;
}

export interface Journey {
  id: string;
  originAddress: string;
  originLat: number;
  originLng: number;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  transportMode: string;
  estimatedDuration?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  hasTolls?: boolean;
  weatherWarnings?: Array<{ lat: number; lng: number; title: string }>;
  routePolyline?: string | null;
  routePoints?: Array<{ lat: number; lng: number }>;
  interceptCount?: number;
  intercepts?: Intercept[];
}

interface JourneyState {
  current: Journey | null;
  intercepts: Intercept[];
  loading: boolean;
  error: string | null;
  selectedInterceptId: string | null;
  setCurrent: (j: Journey | null) => void;
  setIntercepts: (i: Intercept[]) => void;
  setSelectedIntercept: (id: string | null) => void;
  buildJourney: (params: {
    originAddress: string;
    destinationAddress: string;
    transportMode: TransportMode;
  }) => Promise<void>;
  loadIntercepts: () => Promise<void>;
}

export const useJourney = create<JourneyState>((set, get) => ({
  current: null,
  intercepts: [],
  loading: false,
  error: null,
  selectedInterceptId: null,
  setCurrent: (current) => set({ current }),
  setIntercepts: (intercepts) => set({ intercepts }),
  setSelectedIntercept: (selectedInterceptId) => set({ selectedInterceptId }),
  buildJourney: async (params) => {
    set({ loading: true, error: null });
    try {
      const journey = await postJourney(params);
      const intercepts = await getIntercepts(journey.id);
      set({ current: journey, intercepts, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  loadIntercepts: async () => {
    const { current } = get();
    if (!current) return;
    set({ loading: true, error: null });
    try {
      const intercepts = await getIntercepts(current.id);
      set({ intercepts, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
