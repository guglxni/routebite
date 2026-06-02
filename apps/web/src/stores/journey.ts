import { create } from "zustand";
import type { GPSPosition, TransportMode, VehicleDetails } from "@routebite/shared/types";
import { getIntercepts, patchJourneyTelemetry, postJourney } from "../lib/api";

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
  etaSeconds?: number;
  stationCode?: string;
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
  vehicleDetails?: VehicleDetails | null;
}

interface JourneyState {
  current: Journey | null;
  intercepts: Intercept[];
  loading: boolean;
  error: string | null;
  selectedInterceptId: string | null;
  liveLocationSharing: boolean;
  customerPosition: GPSPosition | null;
  setCurrent: (j: Journey | null) => void;
  setIntercepts: (i: Intercept[]) => void;
  setSelectedIntercept: (id: string | null) => void;
  setLiveLocationSharing: (enabled: boolean) => void;
  buildJourney: (params: {
    originAddress: string;
    destinationAddress: string;
    transportMode: TransportMode;
    vehicleDetails?: VehicleDetails;
    liveLocationSharing?: boolean;
  }) => Promise<void>;
  updateTelemetry: (patch: {
    vehicleDetails?: Partial<VehicleDetails>;
    liveLocation?: GPSPosition;
    liveLocationSharing?: boolean;
  }) => Promise<void>;
  pushLiveLocation: (position: GPSPosition) => Promise<void>;
  loadIntercepts: () => Promise<void>;
}

export const useJourney = create<JourneyState>((set, get) => ({
  current: null,
  intercepts: [],
  loading: false,
  error: null,
  selectedInterceptId: null,
  liveLocationSharing: false,
  customerPosition: null,
  setCurrent: (current) => set({ current }),
  setIntercepts: (intercepts) => set({ intercepts }),
  setSelectedIntercept: (selectedInterceptId) => set({ selectedInterceptId }),
  setLiveLocationSharing: (liveLocationSharing) => set({ liveLocationSharing }),
  buildJourney: async (params) => {
    set({ loading: true, error: null });
    try {
      const journey = await postJourney(params);
      const intercepts = await getIntercepts(journey.id);
      set({
        current: journey,
        intercepts,
        loading: false,
        liveLocationSharing: params.liveLocationSharing ?? false,
        customerPosition: journey.vehicleDetails?.liveLocation ?? null,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },
  updateTelemetry: async (patch) => {
    const { current } = get();
    if (!current) return;
    const { vehicleDetails } = await patchJourneyTelemetry(current.id, patch);
    set({
      current: { ...current, vehicleDetails },
      liveLocationSharing: vehicleDetails.liveLocationSharing ?? get().liveLocationSharing,
      customerPosition: vehicleDetails.liveLocation ?? get().customerPosition,
    });
  },
  pushLiveLocation: async (position) => {
    const { current, liveLocationSharing } = get();
    if (!current || !liveLocationSharing) return;
    set({ customerPosition: position });
    try {
      await patchJourneyTelemetry(current.id, { liveLocation: position, liveLocationSharing: true });
    } catch {
      // Non-blocking — map still updates locally
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
