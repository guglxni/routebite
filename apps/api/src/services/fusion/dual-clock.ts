import type { AlignmentStatus, LatLng, OrderStatus } from '@routebite/shared/types';
import { computeAlignment } from '../tracking/alignment';
import { mapsClient } from '../maps/client';

export interface DualClockInput {
  customerETA?: number;
  riderETA?: number;
  orderStatus: OrderStatus;
  customerPosition?: LatLng | null;
  riderPosition?: LatLng | null;
  intercept: LatLng;
  restaurant?: LatLng | null;
  prepSeconds?: number;
  swiggyDistanceKm?: number | null;
}

export interface DualClockSnapshot {
  customerETA: number | null;
  riderETA: number | null;
  mapsRiderETA: number | null;
  swiggyRiderETA: number | null;
  prepReadyIn: number | null;
  deltaSeconds: number | null;
  alignment: (AlignmentStatus & { score: number; riderOutsideIsochrone?: boolean }) | null;
  clocks: {
    you: { label: string; etaSeconds: number | null };
    rider: { label: string; etaSeconds: number | null };
    kitchen: { label: string; etaSeconds: number | null };
  };
  honesty: {
    swiggyDistanceKm: number | null;
    mapsBikeSeconds: number | null;
    note: string;
  };
}

/** Fuse Maps matrix ETAs with Swiggy track ETAs for dual-clock UI. */
export async function buildDualClock(input: DualClockInput): Promise<DualClockSnapshot> {
  let mapsRiderETA: number | null = null;
  if (input.riderPosition) {
    try {
      mapsRiderETA = await mapsClient.getTravelTime(
        input.riderPosition,
        input.intercept,
        'bike',
        { departureTime: new Date() }
      );
    } catch {
      mapsRiderETA = null;
    }
  } else if (input.restaurant) {
    try {
      mapsRiderETA = await mapsClient.getTravelTime(
        input.restaurant,
        input.intercept,
        'bike',
        { departureTime: new Date() }
      );
    } catch {
      mapsRiderETA = null;
    }
  }

  const swiggyRiderETA = input.riderETA ?? null;
  const riderETA = mapsRiderETA ?? swiggyRiderETA;
  const customerETA = input.customerETA ?? null;
  const prepReadyIn = input.prepSeconds ?? null;

  let alignment: DualClockSnapshot['alignment'] = null;
  if (customerETA != null && riderETA != null) {
    alignment = computeAlignment({
      customerETA,
      riderETA,
      orderStatus: input.orderStatus,
      prepTime: prepReadyIn ?? undefined,
      riderPosition: input.riderPosition ?? undefined,
    });
  }

  const delta =
    customerETA != null && riderETA != null ? customerETA - riderETA : null;

  return {
    customerETA,
    riderETA,
    mapsRiderETA,
    swiggyRiderETA,
    prepReadyIn,
    deltaSeconds: delta,
    alignment,
    clocks: {
      you: { label: 'Your arrival', etaSeconds: customerETA },
      rider: { label: 'Rider arrival', etaSeconds: riderETA },
      kitchen: { label: 'Order ready', etaSeconds: prepReadyIn },
    },
    honesty: {
      swiggyDistanceKm: input.swiggyDistanceKm ?? null,
      mapsBikeSeconds: mapsRiderETA,
      note:
        mapsRiderETA != null && swiggyRiderETA != null
          ? `Maps bike ETA ${Math.round(mapsRiderETA / 60)} min vs Swiggy ${Math.round(swiggyRiderETA / 60)} min`
          : 'Dual-clock uses Maps when GPS is available; Swiggy track otherwise.',
    },
  };
}
