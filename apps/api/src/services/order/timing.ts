import type { LatLng, TransportMode } from '@routebite/shared/types';
import { TIMING, riderTransportMode } from '@routebite/shared/constants';
import { mapsClient } from '../maps/client';
import { weatherClient } from '../weather/client';
import type { TimingCalculation } from './types';

/**
 * Calculate auto-place timing using real traffic-aware ETAs when coordinates
 * are available, falling back to heuristic estimation otherwise.
 *
 * Formula:
 *   autoPlaceTime = interceptETA - prepTime - riderTravel - safetyBuffer - trafficBuffer
 *
 * Returns the absolute timestamp when the order should be auto-placed.
 */
export async function calculateOrderTiming(
  interceptETA: number, // seconds from journey start
  prepTime: number,     // seconds (restaurant estimate)
  transportMode: string,
  coordinates?: {
    restaurant: LatLng;
    intercept: LatLng;
  },
  opts?: { includeWeatherBuffer?: boolean; server?: 'food' | 'instamart' }
): Promise<TimingCalculation> {
  // Prefer explicit TWO_WHEELER (bike) for food riders; fall back to caller mode.
  const riderMode: TransportMode =
    opts?.server != null
      ? riderTransportMode(opts.server)
      : transportMode === 'car' || transportMode === 'bike'
        ? (transportMode as TransportMode)
        : riderTransportMode('food');

  // Use real matrix ETA if we have coordinates, else fallback heuristic
  let riderTravel: number;
  if (coordinates) {
    try {
      riderTravel = await mapsClient.getTravelTime(
        coordinates.restaurant,
        coordinates.intercept,
        riderMode,
        { departureTime: new Date(Date.now() + 120_000) }
      );
    } catch {
      riderTravel = fallbackRiderTravel(0);
    }
  } else {
    riderTravel = fallbackRiderTravel(0);
  }

  let weatherBuffer = 0;
  if (opts?.includeWeatherBuffer && coordinates?.intercept) {
    try {
      const wx = await weatherClient.getContextForPoint(coordinates.intercept);
      weatherBuffer = wx.timingBufferSeconds;
    } catch {
      // Ignore weather API failures for timing
    }
  }

  const { SAFETY_BUFFER_S, TRAFFIC_BUFFER_S } = TIMING;
  const autoPlaceTime =
    interceptETA - prepTime - riderTravel - SAFETY_BUFFER_S - TRAFFIC_BUFFER_S - weatherBuffer;

  // Auto-place time relative to now (assume journey starts now)
  const autoPlaceAt = new Date(Date.now() + autoPlaceTime * 1000);

  return {
    interceptETA,
    prepTime,
    riderTravel,
    safetyBuffer: SAFETY_BUFFER_S,
    trafficBuffer: TRAFFIC_BUFFER_S,
    weatherBuffer: weatherBuffer || undefined,
    autoPlaceTime,
    autoPlaceAt,
  };
}

/**
 * Legacy synchronous timing calculator (heuristic only).
 * Prefer `calculateOrderTiming` for production order placement.
 */
export function calculateAutoPlaceTiming(
  interceptETA: number,
  prepTime: number,
  riderTravel: number
): TimingCalculation {
  const { SAFETY_BUFFER_S, TRAFFIC_BUFFER_S, AUTO_PLACE_FORMULA } = TIMING;
  const autoPlaceTime = AUTO_PLACE_FORMULA(interceptETA, prepTime, riderTravel);
  const autoPlaceAt = new Date(Date.now() + autoPlaceTime * 1000);

  return {
    interceptETA,
    prepTime,
    riderTravel,
    safetyBuffer: SAFETY_BUFFER_S,
    trafficBuffer: TRAFFIC_BUFFER_S,
    autoPlaceTime,
    autoPlaceAt,
  };
}

/**
 * Estimate preparation time based on server type and item count.
 */
export function estimatePrepTime(server: 'food' | 'instamart', itemCount: number): number {
  if (server === 'instamart') {
    // Instamart: 5 min base + 1 min per item
    return 5 * 60 + itemCount * 60;
  }
  // Food: 15 min base + 3 min per item
  return 15 * 60 + itemCount * 3 * 60;
}

/**
 * Fallback rider travel time estimation when no coordinates are available
 * or the matrix API fails.
 *
 * Uses a heuristic: assumes 3 km at 20 km/h average for two-wheeler
 * delivery in Indian cities.
 */
export function fallbackRiderTravel(_restaurantDistanceMeters?: number): number {
  const speedMps = 20_000 / 3600;
  const distance = _restaurantDistanceMeters ?? 3000;
  return Math.round(distance / speedMps);
}

/**
 * Batch-compare multiple restaurants to a single intercept using the
 * Route Matrix API. Returns the restaurant index with the lowest rider ETA.
 *
 * This enables smart restaurant ranking for "auto-place" orders —
 * the system can pick the restaurant that a rider can reach fastest.
 */
export async function rankRestaurantsByTravelTime(
  restaurantLocations: LatLng[],
  intercept: LatLng,
  transportMode: 'car' | 'bike' | 'bus' | 'train' | 'metro' | 'walk' = 'bike'
): Promise<Array<{ index: number; durationSeconds: number; distanceMeters: number }>> {
  if (restaurantLocations.length === 0) return [];

  const matrix = await mapsClient.computeRouteMatrix(
    restaurantLocations,
    [intercept],
    transportMode,
    { departureTime: new Date(Date.now() + 120_000) }
  );

  return restaurantLocations
    .map((_, i) => ({
      index: i,
      durationSeconds: matrix.durations[i]?.[0] ?? Infinity,
      distanceMeters: matrix.distances[i]?.[0] ?? Infinity,
    }))
    .sort((a, b) => a.durationSeconds - b.durationSeconds);
}
