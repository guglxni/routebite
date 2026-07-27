import { useEffect, useId, useRef, useState } from "react";
import { JOURNEY_CONSTRAINTS } from "@routebite/shared/constants";
import { Input } from "~/components/ui/input";
import {
  loadPlacesLibrary,
  placeSelectionFromPrediction,
  placesUiKitEnabled,
  type AutocompleteSuggestionItem,
  type LatLngLiteral,
  type PlacesLibrary,
} from "~/lib/google-maps-loader";
import {
  classifySuggestionDistance,
  formatDistanceKm,
  type PlaceCoords,
} from "~/lib/journey-distance";
import { cn } from "~/lib/utils";

export type PlaceAutocompleteInputProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired when a place is resolved with lat/lng (or cleared when text diverges). */
  onPlaceChange?: (place: PlaceCoords | null) => void;
  placeholder?: string;
  required?: boolean;
  /** Fallback datalist id only when Google Places cannot load */
  list?: string;
  className?: string;
  /**
   * Other endpoint (origin↔destination). When set, we use the controllable
   * suggestions UI and grey out predictions inside the min/max band.
   */
  distanceAnchor?: LatLngLiteral | null;
  minDistanceM?: number;
  maxDistanceM?: number;
  /**
   * Force custom suggestions dropdown (required to grey out rows).
   * Defaults to true when `distanceAnchor` is set.
   */
  preferSuggestionsUi?: boolean;
};

type Mode = "loading" | "element" | "suggestions" | "fallback";

function predictionLabel(
  prediction: NonNullable<AutocompleteSuggestionItem["placePrediction"]>,
): string {
  const text = prediction.text;
  if (typeof text === "string") return text;
  if (text?.text) return text.text;
  const main = prediction.mainText?.text ?? "";
  const secondary = prediction.secondaryText?.text ?? "";
  return [main, secondary].filter(Boolean).join(", ");
}

function suggestionHint(
  kind: "ok" | "too_short" | "too_long" | "unknown",
  distanceM: number | undefined,
  minM: number,
  maxM: number,
): string | null {
  if (kind === "too_short" && distanceM != null) {
    return `${formatDistanceKm(distanceM)} — too close (min ${formatDistanceKm(minM)})`;
  }
  if (kind === "too_long" && distanceM != null) {
    return `${formatDistanceKm(distanceM)} — too far (max ${formatDistanceKm(maxM)})`;
  }
  if (kind === "ok" && distanceM != null) {
    return formatDistanceKm(distanceM);
  }
  return null;
}

/**
 * Google Places Autocomplete (New):
 * 1) Controllable AutocompleteSuggestion dropdown (used when greying nearby places)
 * 2) PlaceAutocompleteElement web component
 * 3) Plain input + optional datalist only if Maps JS fails
 */
export function PlaceAutocompleteInput({
  id,
  value,
  onChange,
  onPlaceChange,
  placeholder,
  required,
  list,
  className,
  distanceAnchor = null,
  minDistanceM = JOURNEY_CONSTRAINTS.MIN_DISTANCE_M,
  maxDistanceM = JOURNEY_CONSTRAINTS.MAX_DISTANCE_M,
  preferSuggestionsUi,
}: PlaceAutocompleteInputProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const placesLibRef = useRef<PlacesLibrary | null>(null);
  const onPlaceChangeRef = useRef(onPlaceChange);
  onPlaceChangeRef.current = onPlaceChange;

  const useSuggestionsUi = preferSuggestionsUi ?? Boolean(distanceAnchor);

  const [mode, setMode] = useState<Mode>(placesUiKitEnabled() ? "loading" : "fallback");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionItem[]>([]);
  const [open, setOpen] = useState(false);
  const reactId = useId();
  const inputId = id ?? reactId;

  // Mount Places — prefer suggestions UI when we need row-level disable styling
  useEffect(() => {
    if (!placesUiKitEnabled()) {
      setMode("fallback");
      return;
    }

    let cancelled = false;

    const onSelect = async (ev: Event) => {
      const placePrediction =
        (ev as CustomEvent).detail?.placePrediction ??
        (ev as unknown as { placePrediction?: unknown }).placePrediction;
      if (!placePrediction) return;
      const prediction = placePrediction as NonNullable<
        AutocompleteSuggestionItem["placePrediction"]
      >;
      const selected = await placeSelectionFromPrediction(prediction);
      if (selected) {
        onChange(selected.address);
        onPlaceChangeRef.current?.(selected);
        return;
      }
      const text = predictionLabel(prediction);
      if (text) {
        onChange(text);
        onPlaceChangeRef.current?.(null);
      }
    };

    (async () => {
      const lib = await loadPlacesLibrary();
      if (cancelled) return;
      placesLibRef.current = lib;

      if (!lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions && !lib?.PlaceAutocompleteElement) {
        setMode("fallback");
        return;
      }

      // Controllable list when greying is needed (or forced)
      if (
        useSuggestionsUi &&
        lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions
      ) {
        setMode("suggestions");
        return;
      }

      if (!lib?.PlaceAutocompleteElement || !hostRef.current) {
        if (lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          setMode("suggestions");
          return;
        }
        setMode("fallback");
        return;
      }

      try {
        const el = new lib.PlaceAutocompleteElement({});
        (el as HTMLElement & { includedRegionCodes?: string[] }).includedRegionCodes = ["in"];
        if ("placeholder" in el) {
          (el as HTMLElement & { placeholder?: string }).placeholder =
            placeholder ?? "Search places in India";
        } else {
          el.setAttribute("placeholder", placeholder ?? "Search places in India");
        }
        el.className = cn("rb-place-autocomplete w-full", className);
        el.addEventListener("gmp-select", onSelect as EventListener);
        el.addEventListener("gmp-placeselect", onSelect as EventListener);

        hostRef.current.replaceChildren(el);
        elementRef.current = el;

        if (value && "value" in el) {
          try {
            (el as HTMLElement & { value: string }).value = value;
          } catch {
            /* ignore */
          }
        }

        setMode("element");
      } catch (err) {
        console.warn("[routebite] PlaceAutocompleteElement mount failed:", err);
        if (lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          setMode("suggestions");
        } else {
          setMode("fallback");
        }
      }
    })();

    return () => {
      cancelled = true;
      const el = elementRef.current;
      if (el) {
        el.removeEventListener("gmp-select", onSelect as EventListener);
        el.removeEventListener("gmp-placeselect", onSelect as EventListener);
      }
      elementRef.current = null;
    };
    // Remount when UI strategy changes (anchor appears/disappears)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSuggestionsUi]);

  // Programmatic Google suggestions (Places API New)
  useEffect(() => {
    if (mode !== "suggestions") return;
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      const lib = placesLibRef.current ?? (await loadPlacesLibrary());
      placesLibRef.current = lib;
      if (!lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) return;

      try {
        if (!sessionTokenRef.current && lib.AutocompleteSessionToken) {
          sessionTokenRef.current = new lib.AutocompleteSessionToken();
        }
        const { suggestions: next } =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            sessionToken: sessionTokenRef.current ?? undefined,
            includedRegionCodes: ["in"],
            // Enables PlacePrediction.distanceMeters for grey-out
            ...(distanceAnchor ? { origin: distanceAnchor } : {}),
          });
        if (!cancelled) {
          const list = next ?? [];
          // Selectable first, then greyed — keeps valid options easy to pick
          list.sort((a, b) => {
            const da = a.placePrediction?.distanceMeters;
            const db = b.placePrediction?.distanceMeters;
            const ca = classifySuggestionDistance(da, {
              minM: minDistanceM,
              maxM: maxDistanceM,
            });
            const cb = classifySuggestionDistance(db, {
              minM: minDistanceM,
              maxM: maxDistanceM,
            });
            const rank = (c: typeof ca) =>
              c === "ok" ? 0 : c === "unknown" ? 1 : 2;
            return rank(ca) - rank(cb);
          });
          setSuggestions(list);
          setOpen(true);
        }
      } catch (err) {
        console.warn("[routebite] AutocompleteSuggestion failed:", err);
        if (!cancelled) setSuggestions([]);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [mode, value, distanceAnchor, minDistanceM, maxDistanceM]);

  const emitTextChange = (next: string) => {
    onChange(next);
    // Text diverged from a resolved place — clear coords until re-selected
    onPlaceChangeRef.current?.(null);
  };

  const pickSuggestion = async (item: AutocompleteSuggestionItem, disabled: boolean) => {
    if (disabled) return;
    const prediction = item.placePrediction;
    if (!prediction) return;
    const selected = await placeSelectionFromPrediction(prediction);
    if (selected) {
      onChange(selected.address);
      onPlaceChangeRef.current?.(selected);
    } else {
      onChange(predictionLabel(prediction));
      onPlaceChangeRef.current?.(null);
    }
    sessionTokenRef.current = null;
    setOpen(false);
    setSuggestions([]);
  };

  if (mode === "fallback") {
    return (
      <div className="space-y-1">
        <Input
          id={inputId}
          list={list}
          value={value}
          onChange={(e) => emitTextChange(e.target.value)}
          placeholder={placeholder}
          className={cn("bg-surface-raised border-border-subtle", className)}
          required={required}
        />
        {placesUiKitEnabled() && (
          <p className="text-[10px] text-rose/80">
            Google Places couldn&apos;t load — using demo suggestions. Check API key referrer
            restrictions for localhost:3000.
          </p>
        )}
      </div>
    );
  }

  if (mode === "suggestions") {
    return (
      <div className="relative">
        <Input
          id={inputId}
          value={value}
          onChange={(e) => {
            emitTextChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          className={cn("bg-surface-raised border-border-subtle", className)}
          required={required}
          autoComplete="off"
        />
        {distanceAnchor && (
          <p className="mt-1 text-[10px] text-text-muted">
            Places within {formatDistanceKm(minDistanceM)} of the other stop are greyed out.
          </p>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border-subtle bg-[#0c0c14] py-1 shadow-xl">
            {suggestions.map((s, i) => {
              const prediction = s.placePrediction;
              const label = prediction ? predictionLabel(prediction) : "";
              if (!label) return null;
              const distanceM = prediction?.distanceMeters;
              const kind = classifySuggestionDistance(distanceM, {
                minM: minDistanceM,
                maxM: maxDistanceM,
              });
              const disabled = kind === "too_short" || kind === "too_long";
              const hint = suggestionHint(kind, distanceM, minDistanceM, maxDistanceM);

              return (
                <li key={`${label}-${i}`}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-disabled={disabled}
                    title={disabled ? (hint ?? "Outside allowed journey distance") : undefined}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors",
                      disabled
                        ? "cursor-not-allowed text-zinc-600 opacity-55"
                        : "text-zinc-200 hover:bg-amber/10 hover:text-amber",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void pickSuggestion(s, disabled)}
                  >
                    <span className={cn(disabled && "line-through decoration-zinc-600")}>
                      {label}
                    </span>
                    {hint && (
                      <span
                        className={cn(
                          "text-[10px]",
                          disabled ? "text-rose/70" : "text-text-muted",
                        )}
                      >
                        {hint}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // loading | element
  return (
    <div className="relative">
      {mode === "loading" && (
        <Input
          id={inputId}
          value={value}
          onChange={(e) => emitTextChange(e.target.value)}
          placeholder={placeholder ?? "Loading Google Places…"}
          className={cn("bg-surface-raised border-border-subtle", className)}
          required={required}
        />
      )}
      <div
        ref={hostRef}
        className={cn(
          "rb-places-ui-kit w-full [&_gmp-place-autocomplete]:block [&_gmp-place-autocomplete]:w-full",
          mode !== "element" && "hidden",
        )}
      />
    </div>
  );
}
