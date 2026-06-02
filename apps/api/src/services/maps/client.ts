import type { LatLng, TransportMode } from '@routebite/shared/types';
import type { GoogleLatLng } from './google-latlng';
import {
  GOOGLE_MAPS_API_BASE,
  GOOGLE_GEOCODING_BASE,
  GOOGLE_ROUTE_MATRIX_BASE,
  GOOGLE_ROADS_BASE,
  GOOGLE_ADDRESS_VALIDATION_BASE,
  TRANSPORT_MODE_MAP,
  ROUTES_FIELD_MASK,
  ROUTES_FIELD_MASK_BASE,
  DEFAULT_ROUTE_EXTRA_COMPUTATIONS,
  ROUTE_MATRIX_FIELD_MASK,
} from './constants';
import type {
  ComputeRoutesRequest,
  ComputeRoutesResponse,
  GeocodeResponse,
  JourneyRoute,
  RouteMatrixRequest,
  RouteMatrixResponse,
  RouteStep,
  TravelTimeMatrix,
  SnapToRoadsResponse,
  SpeedLimitsResponse,
  AddressValidationResponse,
  ComputeRouteOptions,
} from './types';
import { routeCache, geocodeCache, matrixCache, roadsCache, addressValidationCache, makeRouteKey, makeMatrixKey } from './cache';
import { PlacesInsightsClient } from './places';
import { toGoogleLatLng, fromGoogleLatLng } from './google-latlng';
import { withGoogleRetry } from './retry';
import { MAPS_FEATURES } from '@routebite/shared/constants';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.warn('⚠️ GOOGLE_MAPS_API_KEY not set. Maps services will fail.');
}

export class GoogleMapsClient {
  private apiKey: string;
  private places: PlacesInsightsClient;

  constructor(apiKey = API_KEY) {
    this.apiKey = apiKey ?? '';
    this.places = new PlacesInsightsClient({ apiKey: this.apiKey });
  }

  countRestaurantsNear(point: LatLng, radiusM?: number) {
    return this.places.countRestaurantsNear(point, radiusM);
  }

  countRestaurantsForPoints(points: LatLng[], radiusM?: number) {
    return this.places.countRestaurantsForPoints(points, radiusM);
  }

  resolveRestaurantCount(point: LatLng, gridCounts: Map<string, number>) {
    return this.places.resolveCountForPoint(point, gridCounts);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  Routes API v2 — Single Route
  // ══════════════════════════════════════════════════════════════════════════════

  async computeRoute(
    origin: string | LatLng,
    destination: string | LatLng,
    transportMode: TransportMode,
    opts?: ComputeRouteOptions
  ): Promise<JourneyRoute> {
    const mapped = TRANSPORT_MODE_MAP[transportMode];
    if (!mapped) throw new Error(`Unsupported transport mode: ${transportMode}`);

    const originLL = typeof origin === 'string' ? await this.geocode(origin) : origin;
    const destLL = typeof destination === 'string' ? await this.geocode(destination) : destination;

    const useExtras = opts?.extraComputations !== false && MAPS_FEATURES.ROUTES_EXTRA_COMPUTATIONS;
    // Traffic-aware routing requires departureTime in the future (Google Routes API constraint)
    let departureTime = opts?.departureTime;
    if (
      !departureTime &&
      MAPS_FEATURES.DEPARTURE_TIME_ROUTING &&
      mapped.routingPreference?.includes('TRAFFIC')
    ) {
      departureTime = new Date(Date.now() + 120_000);
    } else if (departureTime && departureTime.getTime() <= Date.now()) {
      departureTime = new Date(Date.now() + 120_000);
    }

    const cacheKey = makeRouteKey(originLL, destLL, transportMode) +
      (departureTime ? `|${Math.floor(departureTime.getTime() / 300_000)}` : '') +
      (useExtras ? '|extras' : '');

    if (!departureTime) {
      const cached = routeCache.get(cacheKey);
      if (cached) return cached as JourneyRoute;
    }

    const body: ComputeRoutesRequest = {
      origin: { location: { latLng: toGoogleLatLng(originLL) } },
      destination: { location: { latLng: toGoogleLatLng(destLL) } },
      travelMode: mapped.travelMode,
      ...(mapped.routingPreference ? { routingPreference: mapped.routingPreference } : {}),
      units: 'METRIC',
      languageCode: 'en-IN',
      ...(departureTime ? { departureTime: departureTime.toISOString() } : {}),
      ...(useExtras ? { extraComputations: [...DEFAULT_ROUTE_EXTRA_COMPUTATIONS] } : {}),
      ...(opts?.avoidTolls || opts?.avoidHighways
        ? {
            routeModifiers: {
              avoidTolls: opts.avoidTolls,
              avoidHighways: opts.avoidHighways,
            },
          }
        : {}),
    };

    const fieldMask = useExtras ? ROUTES_FIELD_MASK : ROUTES_FIELD_MASK_BASE;

    const data = await withGoogleRetry(async () => {
      const res = await fetch(GOOGLE_MAPS_API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Routes API error ${res.status}: ${text}`);
      }

      return (await res.json()) as ComputeRoutesResponse;
    });

    const route = data.routes[0];
    if (!route) throw new Error('No route found');

    const duration = parseInt(route.duration.replace('s', ''), 10);

    const legAdvisory = route.legs?.[0]?.travelAdvisory;
    const routeAdvisory = route.travelAdvisory ?? legAdvisory;

    const result: JourneyRoute = {
      polylinePoints: this.decodePolyline(route.polyline.encodedPolyline),
      encodedPolyline: route.polyline.encodedPolyline,
      distanceMeters: route.distanceMeters,
      durationSeconds: duration,
      steps: route.legs.flatMap(l => l.steps.map(normalizeRouteStep)),
      travelAdvisory: routeAdvisory
        ? {
            speedReadingIntervals: routeAdvisory.speedReadingIntervals,
            tollInfo: routeAdvisory.tollInfo,
          }
        : undefined,
      hasTolls: Boolean(routeAdvisory?.tollInfo),
    };

    routeCache.set(cacheKey, result);
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  Route Matrix API — Batch ETAs (ComputeRoutesMatrix)
  // ══════════════════════════════════════════════════════════════════════════════

  async computeRouteMatrix(
    origins: LatLng[],
    destinations: LatLng[],
    transportMode: TransportMode
  ): Promise<TravelTimeMatrix> {
    if (origins.length === 0 || destinations.length === 0) {
      return { origins, destinations, durations: [], distances: [] };
    }

    // Check cache
    const cacheKey = makeMatrixKey(origins, destinations, transportMode);
    const cached = matrixCache.get(cacheKey);
    if (cached) return cached as TravelTimeMatrix;

    const mapped = TRANSPORT_MODE_MAP[transportMode];
    if (!mapped) throw new Error(`Unsupported transport mode: ${transportMode}`);

    const body: RouteMatrixRequest = {
      origins: origins.map(o => ({ waypoint: { location: { latLng: toGoogleLatLng(o) } } })),
      destinations: destinations.map(d => ({ waypoint: { location: { latLng: toGoogleLatLng(d) } } })),
      travelMode: mapped.travelMode,
      ...(mapped.routingPreference ? { routingPreference: mapped.routingPreference } : {}),
      units: 'METRIC',
      languageCode: 'en-IN',
    };

    const res = await fetch(GOOGLE_ROUTE_MATRIX_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': ROUTE_MATRIX_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Route Matrix API error ${res.status}: ${text}`);
    }

    const elements = (await res.json()) as RouteMatrixResponse;

    // Build dense matrices
    const durations: (number | null)[][] = Array.from({ length: origins.length }, () =>
      Array(destinations.length).fill(null)
    );
    const distances: (number | null)[][] = Array.from({ length: origins.length }, () =>
      Array(destinations.length).fill(null)
    );

    for (const el of elements) {
      const i = el.originIndex;
      const j = el.destinationIndex;
      if (el.duration) {
        durations[i][j] = parseInt(el.duration.replace('s', ''), 10);
      }
      if (el.distanceMeters !== undefined) {
        distances[i][j] = el.distanceMeters;
      }
    }

    const result: TravelTimeMatrix = { origins, destinations, durations, distances };
    matrixCache.set(cacheKey, result);
    return result;
  }

  /**
   * Convenience: get travel time from a single origin to a single destination.
   */
  async getTravelTime(origin: LatLng, destination: LatLng, transportMode: TransportMode): Promise<number> {
    const matrix = await this.computeRouteMatrix([origin], [destination], transportMode);
    return matrix.durations[0]?.[0] ?? 0;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  Geocoding
  // ══════════════════════════════════════════════════════════════════════════════

  async geocode(address: string): Promise<LatLng> {
    const cacheKey = `geo:${address}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached as LatLng;

    return withGoogleRetry(async () => {
      const url = new URL(GOOGLE_GEOCODING_BASE);
      url.searchParams.set('address', address);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('region', 'in');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);

      const data = (await res.json()) as GeocodeResponse;
      if (data.status !== 'OK' || !data.results[0]) {
        throw new Error(`Geocoding failed: ${data.status}`);
      }

      const loc = data.results[0].geometry.location;
      const result = { lat: loc.lat, lng: loc.lng };
      geocodeCache.set(cacheKey, result);
      return result;
    });
  }

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    const cacheKey = `rgeo:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached as string;

    const url = new URL(GOOGLE_GEOCODING_BASE);
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', this.apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Reverse geocoding error: ${res.status}`);

    const data = (await res.json()) as GeocodeResponse;
    if (data.status !== 'OK' || !data.results[0]) {
      throw new Error(`Reverse geocoding failed: ${data.status}`);
    }

    const result = data.results[0].formatted_address;
    geocodeCache.set(cacheKey, result);
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  Address Validation API
  // ══════════════════════════════════════════════════════════════════════════════

  async validateAddress(address: string): Promise<{
    valid: boolean;
    formattedAddress: string;
    location: LatLng;
    placeId: string;
    confidence: 'high' | 'medium' | 'low';
  }> {
    const cacheKey = `av:${address}`;
    const cached = addressValidationCache.get(cacheKey);
    if (cached) return cached as ReturnType<GoogleMapsClient['validateAddress']>;

    return withGoogleRetry(async () => {
      const body = {
        address: {
          regionCode: 'IN',
          addressLines: [address],
        },
      };

      const res = await fetch(GOOGLE_ADDRESS_VALIDATION_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Address Validation API error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as AddressValidationResponse;
      const verdict = data.result.verdict;
      const location = fromGoogleLatLng(data.result.geocode.location);
      const hasGeocode = Number.isFinite(location.lat) && Number.isFinite(location.lng);

      const confidence: 'high' | 'medium' | 'low' =
        verdict.addressComplete && !verdict.hasUnconfirmedComponents
          ? 'high'
          : verdict.addressComplete || hasGeocode
            ? 'medium'
            : 'low';

      const result = {
        valid: verdict.addressComplete ?? hasGeocode,
        formattedAddress: data.result.address.formattedAddress,
        location,
        placeId: data.result.geocode.placeId,
        confidence,
      };

      addressValidationCache.set(cacheKey, result);
      return result;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  Roads API — Snap to Roads & Speed Limits
  // ══════════════════════════════════════════════════════════════════════════════

  async snapToRoads(points: LatLng[]): Promise<LatLng[]> {
    if (points.length === 0) return [];
    if (points.length > 100) throw new Error('Roads API supports max 100 points per request');

    const cacheKey = `snap:${points.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`;
    const cached = roadsCache.get(cacheKey);
    if (cached) return cached as LatLng[];

    return withGoogleRetry(async () => {
      const path = points.map(p => `${p.lat},${fmtCoord(p.lng)}`).join('|');
      const url = new URL(`${GOOGLE_ROADS_BASE}/snapToRoads`);
      url.searchParams.set('path', path);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('interpolate', 'false');

      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Roads API error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as SnapToRoadsResponse;
      const snapped = data.snappedPoints
        .filter(sp => sp.originalIndex !== undefined)
        .sort((a, b) => a.originalIndex - b.originalIndex)
        .map(sp => fromGoogleLatLng(sp.location as GoogleLatLng | LatLng));

      roadsCache.set(cacheKey, snapped);
      return snapped;
    });
  }

  async getSpeedLimits(placeIds: string[]): Promise<SpeedLimitsResponse> {
    if (placeIds.length === 0) return { speedLimits: [] };
    if (placeIds.length > 100) throw new Error('Roads API supports max 100 placeIds per request');

    const cacheKey = `sl:${placeIds.sort().join(',')}`;
    const cached = roadsCache.get(cacheKey);
    if (cached) return cached as SpeedLimitsResponse;

    const url = new URL(`${GOOGLE_ROADS_BASE}/speedLimits`);
    for (const id of placeIds) {
      url.searchParams.append('placeId', id);
    }
    url.searchParams.set('key', this.apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Roads API speed limits error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as SpeedLimitsResponse;
    roadsCache.set(cacheKey, data);
    return data;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  Polyline Decoder
  // ══════════════════════════════════════════════════════════════════════════════

  decodePolyline(encoded: string): LatLng[] {
    const points: LatLng[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points;
  }
}

function normalizeRouteStep(step: RouteStep): RouteStep {
  return {
    ...step,
    startLocation: { latLng: fromGoogleLatLng(step.startLocation.latLng as GoogleLatLng | LatLng) },
    endLocation: { latLng: fromGoogleLatLng(step.endLocation.latLng as GoogleLatLng | LatLng) },
  };
}

function fmtCoord(n: number): string {
  return n.toString();
}

export const mapsClient = new GoogleMapsClient();
