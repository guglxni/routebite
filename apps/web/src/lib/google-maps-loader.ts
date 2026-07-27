/**
 * Lazy-load Maps JavaScript API for Places (New) Autocomplete.
 *
 * Critical: `PlaceAutocompleteElement` is returned by
 * `await google.maps.importLibrary("places")` — do NOT only look at
 * `google.maps.places.PlaceAutocompleteElement` (often undefined).
 */

import type { PlaceCoords } from "~/lib/journey-distance";

export const GMP_USAGE_ATTRIBUTION_ID = "gmp_git_agentskills_v1";

export type LatLngLiteral = { lat: number; lng: number };

export type PlacesLibrary = {
  PlaceAutocompleteElement: new (opts?: Record<string, unknown>) => HTMLElement & {
    includedRegionCodes?: string[];
    placeholder?: string;
    value?: string;
  };
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      sessionToken?: unknown;
      includedRegionCodes?: string[];
      /** When set, each PlacePrediction includes geodesic distanceMeters */
      origin?: LatLngLiteral;
      locationBias?: unknown;
      locationRestriction?: unknown;
    }) => Promise<{ suggestions: AutocompleteSuggestionItem[] }>;
  };
  AutocompleteSessionToken?: new () => unknown;
  Place?: new (opts: { id?: string }) => PlaceLike;
};

export type PlaceLike = {
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
  formattedAddress?: string;
  displayName?: string | { text?: string };
  location?: { lat: () => number; lng: () => number } | LatLngLiteral;
};

export type AutocompleteSuggestionItem = {
  placePrediction?: {
    text?: { text?: string } | string;
    mainText?: { text?: string };
    secondaryText?: { text?: string };
    /** Geodesic meters from AutocompleteRequest.origin */
    distanceMeters?: number;
    toPlace?: () => PlaceLike;
  };
};

type GeocodeResult = {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
};

type GeocodingLibrary = {
  Geocoder: new () => {
    geocode: (req: { address: string }) => Promise<{ results: GeocodeResult[] }>;
  };
};

declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary?: (name: string) => Promise<unknown>;
      };
    };
    __rbMapsReady?: Promise<void>;
  }
}

export function getPlacesUiKitKey(): string | undefined {
  const key =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY_CLIENT as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined);
  return key?.trim() || undefined;
}

export function placesUiKitEnabled(): boolean {
  return Boolean(getPlacesUiKitKey());
}

/**
 * Official dynamic-library bootstrap so `importLibrary` exists before/during script load.
 * @see https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */
function ensureMapsBootstrap(key: string): void {
  if (window.google?.maps?.importLibrary) return;

  type MapsNs = {
    importLibrary?: (name: string, ...args: unknown[]) => Promise<unknown>;
    __ib__?: () => void;
  };

  const w = window as unknown as { google?: { maps?: MapsNs } };
  w.google = w.google || {};
  w.google.maps = w.google.maps || {};
  const d = w.google.maps;
  const pending = new Set<string>();
  let loadPromise: Promise<void> | undefined;

  const load = () => {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const params = new URLSearchParams();
      if (pending.size) params.set("libraries", [...pending].join(","));
      params.set("key", key);
      params.set("v", "weekly");
      params.set("language", "en");
      params.set("region", "IN");
      params.set("loading", "async");
      params.set("callback", "google.maps.__ib__");
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.dataset.gmpAttribution = GMP_USAGE_ATTRIBUTION_ID;
      d.__ib__ = () => resolve();
      script.onerror = () => reject(new Error("Google Maps JavaScript API failed to load"));
      document.head.appendChild(script);
    });
    return loadPromise;
  };

  // Stub until Google replaces `importLibrary` after the script callback.
  // Compare against this function reference — NOT `d.importLibrary` after
  // load (that property is already the real impl, so equality always fails).
  const bootstrapImportLibrary = (name: string, ...args: unknown[]) => {
    pending.add(name);
    return load().then(() => {
      const real = w.google?.maps?.importLibrary;
      if (!real || real === bootstrapImportLibrary) {
        throw new Error("Maps importLibrary not ready");
      }
      return real.call(w.google!.maps, name, ...args);
    });
  };
  d.importLibrary = bootstrapImportLibrary;
}

async function waitForImportLibrary(timeoutMs = 15000): Promise<void> {
  if (window.google?.maps?.importLibrary) return;
  const start = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (window.google?.maps?.importLibrary) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for Google Maps importLibrary"));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Load Places (New). Returns the library from importLibrary("places").
 */
export async function loadPlacesLibrary(): Promise<PlacesLibrary | null> {
  const key = getPlacesUiKitKey();
  if (!key || typeof window === "undefined") return null;

  try {
    ensureMapsBootstrap(key);
    // Prime load
    await window.google!.maps!.importLibrary!("places");
    await waitForImportLibrary();

    const lib = (await window.google!.maps!.importLibrary!("places")) as PlacesLibrary;

    if (lib?.PlaceAutocompleteElement) return lib;

    const attached = (
      window as unknown as { google?: { maps?: { places?: PlacesLibrary } } }
    ).google?.maps?.places;
    if (attached?.PlaceAutocompleteElement) return attached;

    // Suggestions-only still useful
    if (lib?.AutocompleteSuggestion) return lib;

    console.warn("[routebite] Places library loaded but PlaceAutocompleteElement missing");
    return lib ?? null;
  } catch (err) {
    console.warn("[routebite] Google Places failed to load:", err);
    return null;
  }
}

export async function loadGoogleMapsPlaces(): Promise<boolean> {
  const lib = await loadPlacesLibrary();
  return Boolean(lib?.PlaceAutocompleteElement || lib?.AutocompleteSuggestion);
}

export function latLngFromPlaceLocation(
  location: PlaceLike["location"] | undefined,
): LatLngLiteral | null {
  if (!location) return null;
  if (typeof (location as { lat?: unknown }).lat === "function") {
    const ll = location as { lat: () => number; lng: () => number };
    return { lat: ll.lat(), lng: ll.lng() };
  }
  const lit = location as LatLngLiteral;
  if (typeof lit.lat === "number" && typeof lit.lng === "number") return lit;
  return null;
}

export async function placeSelectionFromPrediction(
  prediction: NonNullable<AutocompleteSuggestionItem["placePrediction"]>,
): Promise<PlaceCoords | null> {
  const label = (() => {
    const text = prediction.text;
    if (typeof text === "string") return text;
    if (text?.text) return text.text;
    const main = prediction.mainText?.text ?? "";
    const secondary = prediction.secondaryText?.text ?? "";
    return [main, secondary].filter(Boolean).join(", ");
  })();

  try {
    const place = prediction.toPlace?.();
    if (place?.fetchFields) {
      await place.fetchFields({ fields: ["formattedAddress", "displayName", "location"] });
      const display =
        typeof place.displayName === "string" ? place.displayName : place.displayName?.text;
      const address = (place.formattedAddress ?? display ?? label).trim();
      const ll = latLngFromPlaceLocation(place.location);
      if (address && ll) return { address, ...ll };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Resolve a free-text address to coords (geocoding) for submit-time validation. */
export async function resolveAddressToCoords(address: string): Promise<PlaceCoords | null> {
  const trimmed = address.trim();
  if (!trimmed || typeof window === "undefined") return null;
  const key = getPlacesUiKitKey();
  if (!key) return null;

  try {
    ensureMapsBootstrap(key);
    await waitForImportLibrary();
    const geo = (await window.google!.maps!.importLibrary!("geocoding")) as GeocodingLibrary;
    const geocoder = new geo.Geocoder();
    const { results } = await geocoder.geocode({ address: trimmed });
    const first = results?.[0];
    const loc = first?.geometry?.location;
    if (!loc) return null;
    return {
      address: first.formatted_address?.trim() || trimmed,
      lat: loc.lat(),
      lng: loc.lng(),
    };
  } catch (err) {
    console.warn("[routebite] Geocode failed:", err);
    return null;
  }
}
