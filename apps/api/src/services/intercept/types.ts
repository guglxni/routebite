import type {
  LatLng,
  TransportMode,
  InterceptType,
  InterceptReachability,
} from '@routebite/shared/types';

export interface CandidatePoint {
  lat: number;
  lng: number;
  type: InterceptType;
  dwellTime: number; // seconds
  distanceFromStart: number; // meters
  restaurantCount?: number;
  reachableRestaurantCount?: number;
  reachability?: InterceptReachability;
  safetyRating?: number;
  name?: string;
  stopName?: string;
}

export interface InterceptConfig {
  minScore: number;
  minDwellTime: number; // seconds
  maxPoints: number;
  intervalMeters: number; // minimum spacing between points
}

export interface ScoredInterceptPoint extends CandidatePoint {
  score: number;
  customerETA: number; // seconds from journey start
  riderETA?: number;   // seconds to reach this point
  restaurantNames?: string[];
  weatherRisk?: boolean;
  weatherAlertTitle?: string;
  reachableRestaurantCount?: number;
  reachability?: InterceptReachability;
}

export interface RouteAnalysisInput {
  origin: LatLng;
  destination: LatLng;
  transportMode: TransportMode;
  routePoints: LatLng[];
  steps: Array<{
    startLocation: { latLng: LatLng };
    endLocation: { latLng: LatLng };
    navigationInstruction?: { maneuver: string; instructions: string };
    transitDetails?: {
      stopDetails: {
        arrivalStop: { name: string; location: { latLng: LatLng } };
        departureStop: { name: string; location: { latLng: LatLng } };
      };
    };
  }>;
}
