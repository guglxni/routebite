import type { TransportMode } from '@routebite/shared/types';

// ─── API Base URLs ───────────────────────────────────────────────────────────

export const GOOGLE_MAPS_API_BASE = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const GOOGLE_GEOCODING_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
export const GOOGLE_ROUTE_MATRIX_BASE = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
export const GOOGLE_ROADS_BASE = 'https://roads.googleapis.com/v1';
export const GOOGLE_ADDRESS_VALIDATION_BASE = 'https://addressvalidation.googleapis.com/v1:validateAddress';
export const GOOGLE_PLACES_NEARBY_BASE = 'https://places.googleapis.com/v1/places:searchNearby';
export const GOOGLE_PLACES_AGGREGATE_BASE = 'https://areainsights.googleapis.com/v1:computeInsights';
export const GOOGLE_WEATHER_HOURLY_BASE = 'https://weather.googleapis.com/v1/forecast/hours:lookup';
export const GOOGLE_WEATHER_ALERTS_BASE = 'https://weather.googleapis.com/v1/publicAlerts:lookup';
export const GOOGLE_WEATHER_CURRENT_BASE =
  'https://weather.googleapis.com/v1/currentConditions:lookup';
export const GOOGLE_ISOCHRONES_BASE = 'https://isochrones.googleapis.com/v1/isochrones:generate';
export const GOOGLE_AIR_QUALITY_BASE =
  'https://airquality.googleapis.com/v1/currentConditions:lookup';
export const GOOGLE_POLLEN_BASE = 'https://pollen.googleapis.com/v1/forecast:lookup';
export const GOOGLE_ROUTE_OPTIMIZATION_BASE =
  'https://routeoptimization.googleapis.com/v1';

// ─── Transport Mode Mapping ──────────────────────────────────────────────────

/**
 * India delivery bikes use TWO_WHEELER (not BICYCLE) on Routes + Route Matrix.
 * Isochrones has no TWO_WHEELER — see ISOCHRONE.RIDER_MODE + BIKE_BUFFER_RATIO.
 */
export const TRANSPORT_MODE_MAP: Record<TransportMode, { travelMode: string; routingPreference?: string }> = {
  car:      { travelMode: 'DRIVE',           routingPreference: 'TRAFFIC_AWARE_OPTIMAL' },
  bike:     { travelMode: 'TWO_WHEELER',     routingPreference: 'TRAFFIC_AWARE_OPTIMAL' },
  bus:      { travelMode: 'TRANSIT' },
  train:    { travelMode: 'TRANSIT' },
  metro:    { travelMode: 'TRANSIT' },
  walk:     { travelMode: 'WALK' },
};

/** Assert bike → TWO_WHEELER mapping for delivery ETA calls. */
export function googleTravelModeFor(transportMode: TransportMode): string {
  return TRANSPORT_MODE_MAP[transportMode]?.travelMode ?? 'DRIVE';
}

// ─── Routes extraComputations ─────────────────────────────────────────────────

export type RoutesExtraComputation =
  | 'TRAFFIC_ON_POLYLINE'
  | 'TOLLS'
  | 'FUEL_CONSUMPTION'
  | 'NARROW_ROAD_INFO_ON_POLYLINE'
  | 'FLYOVER_INFO_ON_POLYLINE';

export const DEFAULT_ROUTE_EXTRA_COMPUTATIONS: RoutesExtraComputation[] = [
  'TRAFFIC_ON_POLYLINE',
  'TOLLS',
  'NARROW_ROAD_INFO_ON_POLYLINE',
];

// ─── Field Masks ─────────────────────────────────────────────────────────────

export const ROUTES_FIELD_MASK_BASE = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
].join(',');

export const ROUTES_FIELD_MASK_TRAFFIC = [
  'routes.travelAdvisory.speedReadingIntervals',
  'routes.legs.travelAdvisory.speedReadingIntervals',
  'routes.travelAdvisory.tollInfo',
  'routes.legs.travelAdvisory.tollInfo',
  'routes.polylineDetails.narrowRoadInfo',
  'routes.polylineDetails.flyoverInfo',
].join(',');

export const ROUTES_FIELD_MASK = `${ROUTES_FIELD_MASK_BASE},${ROUTES_FIELD_MASK_TRAFFIC}`;

export const ROUTE_MATRIX_FIELD_MASK = [
  'originIndex',
  'destinationIndex',
  'duration',
  'distanceMeters',
  'status',
].join(',');

export const ROADS_SNAP_FIELD_MASK = 'snappedPoints';

export const PLACES_NEARBY_FIELD_MASK = 'places.id';
/** Nearby Search with locations for isochrone point-in-polygon filtering. */
export const PLACES_NEARBY_LOCATION_FIELD_MASK =
  'places.id,places.location,places.displayName,places.businessStatus';
