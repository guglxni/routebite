import type { LatLng, TransportMode } from '@routebite/shared/types';
import type { GoogleLatLng } from './google-latlng';

// ─── Routes API v2 Types ─────────────────────────────────────────────────────

export interface ComputeRoutesRequest {
  origin: { address: string } | { location: { latLng: GoogleLatLng } };
  destination: { address: string } | { location: { latLng: GoogleLatLng } };
  travelMode: string;
  routingPreference?: string;
  departureTime?: string;
  extraComputations?: string[];
  computeAlternativeRoutes?: boolean;
  routeModifiers?: {
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    avoidFerries?: boolean;
  };
  languageCode?: string;
  units?: 'METRIC' | 'IMPERIAL';
}

export interface ComputeRoutesResponse {
  routes: Route[];
  fallbackInfo?: FallbackInfo;
}

export interface Route {
  legs: RouteLeg[];
  distanceMeters: number;
  duration: string; // e.g. "3600s"
  polyline: Polyline;
  description?: string;
  warnings?: string[];
  viewport?: Viewport;
  travelAdvisory?: TravelAdvisory;
}

export interface RouteLeg {
  distanceMeters: number;
  duration: string;
  startLocation: Location;
  endLocation: Location;
  steps: RouteStep[];
  travelAdvisory?: TravelAdvisory;
}

export interface RouteStep {
  distanceMeters: number;
  staticDuration: string;
  polyline: Polyline;
  startLocation: Location;
  endLocation: Location;
  navigationInstruction?: NavigationInstruction;
  transitDetails?: TransitDetails;
  travelMode: string;
}

export interface NavigationInstruction {
  maneuver: string;
  instructions: string;
}

export interface TransitDetails {
  stopDetails: {
    arrivalStop: { name: string; location: Location };
    departureStop: { name: string; location: Location };
    arrivalTime: string;
    departureTime: string;
  };
  headsign: string;
  transitLine: { name: string };
}

export interface Polyline {
  encodedPolyline: string;
}

export interface Location {
  latLng: LatLng;
}

export interface Viewport {
  low: LatLng;
  high: LatLng;
}

export interface TravelAdvisory {
  speedReadingIntervals?: SpeedReadingInterval[];
  tollInfo?: { estimatedPrice?: unknown[] };
}

export interface SpeedReadingInterval {
  startPolylinePointIndex: number;
  endPolylinePointIndex: number;
  speed: 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM';
}

export interface FallbackInfo {
  routingMode: string;
  reason: string;
}

// ─── Geocoding Types ─────────────────────────────────────────────────────────

export interface GeocodeResponse {
  results: GeocodeResult[];
  status: string;
}

export interface GeocodeResult {
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  place_id: string;
  types: string[];
  address_components: AddressComponent[];
}

export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

// ─── Route Matrix Types ──────────────────────────────────────────────────────

export interface RouteMatrixRequest {
  origins: RouteMatrixWaypoint[];
  destinations: RouteMatrixWaypoint[];
  travelMode: string;
  routingPreference?: string;
  units?: 'METRIC' | 'IMPERIAL';
  languageCode?: string;
}

export interface RouteMatrixWaypoint {
  waypoint: { location: { latLng: GoogleLatLng } };
}

export interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  duration?: string;       // e.g. "1200s"
  distanceMeters?: number;
  status: { code: number; message: string };
}

export type RouteMatrixResponse = RouteMatrixElement[];

export interface TravelTimeMatrix {
  origins: LatLng[];
  destinations: LatLng[];
  durations: (number | null)[][]; // durations[i][j] = seconds from origin i to destination j
  distances: (number | null)[][]; // meters
}

// ─── Roads API Types ─────────────────────────────────────────────────────────

export interface SnapToRoadsRequest {
  points: LatLng[];
  interpolate?: boolean;
}

export interface SnapToRoadsResponse {
  snappedPoints: SnappedPoint[];
}

export interface SnappedPoint {
  location: LatLng;
  originalIndex: number;
  placeId: string;
}

export interface SpeedLimitsRequest {
  placeIds: string[];
}

export interface SpeedLimitsResponse {
  speedLimits: SpeedLimit[];
}

export interface SpeedLimit {
  placeId: string;
  speedLimit: number;      // km/h
  units: string;
}

// ─── Address Validation Types ────────────────────────────────────────────────

export interface AddressValidationRequest {
  address: {
    regionCode: string;
    locality: string;
    addressLines: string[];
  };
  enableUspsCass?: boolean;
}

export interface AddressValidationResponse {
  result: {
    verdict: {
      inputGranularity: string;
      validationGranularity: string;
      geocodeGranularity: string;
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      hasInferredComponents?: boolean;
      hasReplacedComponents?: boolean;
      possibleNextAction?: string;
    };
    address: {
      formattedAddress: string;
      postalAddress: {
        regionCode: string;
        locality: string;
        addressLines: string[];
      };
      addressComponents: Array<{
        componentName: { text: string };
        componentType: string;
        confirmationLevel: string;
      }>;
    };
    geocode: {
      location: GoogleLatLng;
      placeId: string;
    };
  };
}

// ─── Internal Types ──────────────────────────────────────────────────────────

export interface RouteTravelAdvisory {
  speedReadingIntervals?: SpeedReadingInterval[];
  tollInfo?: { estimatedPrice?: unknown[] };
}

export interface JourneyRoute {
  polylinePoints: LatLng[];
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  travelAdvisory?: RouteTravelAdvisory;
  hasTolls?: boolean;
}

export interface ComputeRouteOptions {
  departureTime?: Date;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  extraComputations?: boolean;
}

export interface MapsServiceConfig {
  apiKey: string;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}
