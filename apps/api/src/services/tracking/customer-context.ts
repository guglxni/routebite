import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, journeys, intercepts } from '@routebite/db/schema';
import type { GPSPosition, LatLng, TransportMode, VehicleDetails } from '@routebite/shared/types';
import { MAPS_FEATURES } from '@routebite/shared/constants';
import { mapsClient } from '../maps/client';
import { buildRiderBrief, parseVehicleDetails } from '../order/rider-brief';
import { generateInterceptAddress } from '../order/address';
import { getTrainRun } from '../railways/train-run';
import { etaForStationIntercept } from '../railways/train-journey';

export interface CustomerContext {
  journeyId: string;
  transportMode: TransportMode;
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
  liveLocation?: GPSPosition;
  customerPosition?: LatLng;
  customerETA?: number;
  /** True when ETA came from live GPS → Route Matrix (departure-time aware). */
  etaFromLiveGps?: boolean;
}

function mapsModeForCustomer(transportMode: TransportMode): TransportMode {
  if (transportMode === 'train' || transportMode === 'bus' || transportMode === 'metro') {
    return 'walk';
  }
  return transportMode;
}

export async function loadCustomerContextForOrder(orderId: string): Promise<CustomerContext | null> {
  const db = getDb();
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order?.journeyId || !order.interceptId) return null;

  const [journey, intercept] = await Promise.all([
    db.select().from(journeys).where(eq(journeys.id, order.journeyId)).get(),
    db.select().from(intercepts).where(eq(intercepts.id, order.interceptId)).get(),
  ]);

  if (!journey || !intercept) return null;

  const vehicleDetails =
    parseVehicleDetails(journey.vehicleDetailsJson) ??
    ({ description: 'RouteBite journey' } satisfies VehicleDetails);

  const transportMode = journey.transportMode as TransportMode;
  const interceptLabel = intercept.name ?? undefined;
  let interceptAddress: string | undefined;
  try {
    const addr = await generateInterceptAddress({ lat: intercept.lat, lng: intercept.lng });
    interceptAddress = addr.formatted;
  } catch {
    interceptAddress = undefined;
  }

  const riderBrief = buildRiderBrief(transportMode, vehicleDetails, interceptLabel ?? interceptAddress);

  const liveLocationSharing = Boolean(
    vehicleDetails.liveLocationSharing && vehicleDetails.liveLocation
  );
  const liveLocation = liveLocationSharing ? vehicleDetails.liveLocation : undefined;
  const customerPosition: LatLng | undefined = liveLocation
    ? { lat: liveLocation.lat, lng: liveLocation.lng }
    : { lat: intercept.lat, lng: intercept.lng };

  let customerETA: number | undefined;
  let etaFromLiveGps = false;

  if (transportMode === 'train' && vehicleDetails.trainNumber) {
    try {
      const run = await getTrainRun(vehicleDetails.trainNumber);
      const ntesEta = etaForStationIntercept(run.run, intercept.name);
      if (ntesEta != null) customerETA = ntesEta;
    } catch {
      // fall through
    }
  }

  if (
    customerETA == null &&
    liveLocation &&
    MAPS_FEATURES.TRACK_DEPARTURE_TIME_RECOMPUTE
  ) {
    try {
      const eta = await mapsClient.getTravelTime(
        { lat: liveLocation.lat, lng: liveLocation.lng },
        { lat: intercept.lat, lng: intercept.lng },
        mapsModeForCustomer(transportMode),
        { departureTime: new Date(Date.now() + 120_000) }
      );
      if (eta > 0) {
        customerETA = eta;
        etaFromLiveGps = true;
      }
    } catch {
      // Keep fallback
    }
  } else if (customerETA == null && liveLocation) {
    try {
      const eta = await mapsClient.getTravelTime(
        { lat: liveLocation.lat, lng: liveLocation.lng },
        { lat: intercept.lat, lng: intercept.lng },
        mapsModeForCustomer(transportMode)
      );
      if (eta > 0) {
        customerETA = eta;
        etaFromLiveGps = true;
      }
    } catch {
      // Keep fallback
    }
  }

  if (customerETA == null) {
    customerETA = intercept.estimatedDwellTime ?? 300;
  }

  return {
    journeyId: journey.id,
    transportMode,
    vehicleDetails,
    riderBrief,
    intercept: {
      id: intercept.id,
      lat: intercept.lat,
      lng: intercept.lng,
      name: intercept.name ?? undefined,
      address: interceptAddress,
    },
    liveLocationSharing: Boolean(vehicleDetails.liveLocationSharing),
    liveLocation,
    customerPosition,
    customerETA,
    etaFromLiveGps,
  };
}
