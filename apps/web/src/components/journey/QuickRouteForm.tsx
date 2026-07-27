import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { TransportMode } from "@routebite/shared/types";
import { JOURNEY_CONSTRAINTS } from "@routebite/shared/constants";
import { LiveLocationPanel } from "~/components/journey/LiveLocationPanel";
import { TrainStatusPanel } from "~/components/journey/TrainStatusPanel";
import { TripVehicleFields } from "~/components/journey/TripVehicleFields";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { PlaceAutocompleteInput } from "~/components/places/PlaceAutocompleteInput";
import {
  emptyVehicleForm,
  formToVehicleDetails,
  type VehicleFormState,
} from "~/lib/vehicle-details";
import { placesUiKitEnabled, resolveAddressToCoords } from "~/lib/google-maps-loader";
import {
  evaluateJourneyPair,
  formatDistanceKm,
  type PlaceCoords,
} from "~/lib/journey-distance";
import { toast } from "sonner";
import { useJourney } from "~/stores/journey";

const demoPlaces = [
  "Koramangala, Bengaluru",
  "Indiranagar, Bengaluru",
  "MG Road, Bengaluru",
  "Whitefield, Bengaluru",
  "Electronic City, Bengaluru",
  "Hebbal, Bengaluru",
];

const modes: TransportMode[] = ["car", "bus", "train", "bike"];

type QuickRouteFormProps = {
  datalistId?: string;
  submitLabel?: string;
  onSuccess?: () => void;
  /** Draft pins for map exclusion discs (origin ↔ destination). */
  onDraftPlacesChange?: (draft: {
    origin: PlaceCoords | null;
    destination: PlaceCoords | null;
  }) => void;
};

export function QuickRouteForm({
  datalistId = "rb-places",
  submitLabel = "Find intercepts",
  onSuccess,
  onDraftPlacesChange,
}: QuickRouteFormProps) {
  const { buildJourney, loading, pushLiveLocation, updateTelemetry, liveLocationSharing, setLiveLocationSharing } =
    useJourney();

  const [from, setFrom] = useState("Koramangala, Bengaluru");
  const [to, setTo] = useState("Whitefield, Bengaluru");
  const [fromPlace, setFromPlace] = useState<PlaceCoords | null>(null);
  const [toPlace, setToPlace] = useState<PlaceCoords | null>(null);
  const [mode, setMode] = useState<TransportMode>("car");
  const [vehicle, setVehicle] = useState<VehicleFormState>(emptyVehicleForm);
  const [shareLocation, setShareLocation] = useState(false);
  const [pairHint, setPairHint] = useState<string | null>(null);

  const fromPlaceRef = useRef(fromPlace);
  const toPlaceRef = useRef(toPlace);
  fromPlaceRef.current = fromPlace;
  toPlaceRef.current = toPlace;

  const syncPairUi = (origin: PlaceCoords | null, destination: PlaceCoords | null) => {
    onDraftPlacesChange?.({ origin, destination });
    if (origin && destination) {
      const check = evaluateJourneyPair(origin, destination);
      setPairHint(check.ok ? `About ${formatDistanceKm(check.distanceM)} apart` : check.message);
    } else {
      setPairHint(null);
    }
  };

  const setOriginPlace = (place: PlaceCoords | null) => {
    setFromPlace(place);
    syncPairUi(place, toPlaceRef.current);
  };

  const setDestinationPlace = (place: PlaceCoords | null) => {
    setToPlace(place);
    syncPairUi(fromPlaceRef.current, place);
  };

  // Clear resolved coords when the user edits the text away from the selected address
  useEffect(() => {
    if (fromPlace && from.trim() !== fromPlace.address) {
      setFromPlace(null);
      syncPairUi(null, toPlaceRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  useEffect(() => {
    if (toPlace && to.trim() !== toPlace.address) {
      setToPlace(null);
      syncPairUi(fromPlaceRef.current, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  const pairBlocked = useMemo(() => {
    if (!fromPlace || !toPlace) return false;
    return !evaluateJourneyPair(fromPlace, toPlace).ok;
  }, [fromPlace, toPlace]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;

    try {
      let origin = fromPlace;
      let dest = toPlace;

      // Free-typed / demo datalist — resolve coords before hitting Routes
      if (!origin) origin = await resolveAddressToCoords(from.trim());
      if (!dest) dest = await resolveAddressToCoords(to.trim());

      if (origin && dest) {
        const check = evaluateJourneyPair(origin, dest);
        if (!check.ok) {
          setFromPlace(origin);
          setToPlace(dest);
          syncPairUi(origin, dest);
          toast.error(
            check.reason === "too_short" ? "Too close" : "Too far",
            { description: check.message },
          );
          return;
        }
        setFromPlace(origin);
        setToPlace(dest);
        syncPairUi(origin, dest);
      }

      const vehicleDetails = formToVehicleDetails(mode, vehicle);
      await buildJourney({
        originAddress: (origin?.address ?? from).trim(),
        destinationAddress: (dest?.address ?? to).trim(),
        transportMode: mode,
        vehicleDetails,
        liveLocationSharing: shareLocation,
      });
      const count = useJourney.getState().intercepts.length;
      toast.success("Route analyzed", {
        description: `${count} intercept points ready along your journey.`,
      });
      onSuccess?.();
    } catch (err) {
      toast.error("Route failed", { description: (err as Error).message });
    }
  };

  const onLocationShareToggle = async (enabled: boolean) => {
    setShareLocation(enabled);
    setLiveLocationSharing(enabled);
    const { current } = useJourney.getState();
    if (current) {
      await updateTelemetry({ liveLocationSharing: enabled });
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {placesUiKitEnabled() ? (
        <p className="rounded-lg border border-amber/20 bg-amber/5 px-3 py-2 text-[11px] text-text-secondary">
          Type to search <strong className="text-text-primary">Google Places</strong> (India-biased).
          After one stop is set, suggestions within{" "}
          <strong className="text-text-primary">
            {formatDistanceKm(JOURNEY_CONSTRAINTS.MIN_DISTANCE_M)}
          </strong>{" "}
          are greyed out (journeys need that minimum for intercepts). Your{" "}
          <strong className="text-text-primary">trip mode</strong> is separate from delivery{" "}
          <strong className="text-violet-300">two-wheeler</strong> rider zones.
        </p>
      ) : (
        <p className="text-[11px] text-text-muted">
          Using demo place suggestions. Set{" "}
          <code className="text-amber">VITE_GOOGLE_MAPS_API_KEY</code> in{" "}
          <code className="text-amber">apps/web/.env</code> and restart Vite for Places autocomplete.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="origin">Origin</Label>
        <PlaceAutocompleteInput
          id="origin"
          list={datalistId}
          value={from}
          onChange={setFrom}
          onPlaceChange={setOriginPlace}
          distanceAnchor={toPlace}
          preferSuggestionsUi
          placeholder="Where are you starting?"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="destination">Destination</Label>
        <PlaceAutocompleteInput
          id="destination"
          list={datalistId}
          value={to}
          onChange={setTo}
          onPlaceChange={setDestinationPlace}
          distanceAnchor={fromPlace}
          preferSuggestionsUi
          placeholder="Where are you headed?"
          required
        />
      </div>
      {pairHint && (
        <p
          className={
            pairBlocked
              ? "rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose"
              : "text-[11px] text-emerald"
          }
        >
          {pairHint}
        </p>
      )}
      <datalist id={datalistId}>
        {demoPlaces.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={mode === m ? "default" : "outline"}
            onClick={() => setMode(m)}
            className={mode === m ? "bg-amber text-void hover:bg-amber-light capitalize" : "capitalize"}
          >
            {m}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border-subtle bg-void/30 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Vehicle details
        </p>
        <TripVehicleFields mode={mode} value={vehicle} onChange={setVehicle} />
      </div>

      {mode === "train" && vehicle.trainNumber.length === 5 && (
        <TrainStatusPanel trainNumber={vehicle.trainNumber} trainName={vehicle.trainName} />
      )}

      <LiveLocationPanel
        enabled={shareLocation || liveLocationSharing}
        onEnabledChange={onLocationShareToggle}
        onLocation={(pos) => pushLiveLocation(pos)}
      />

      <Button
        type="submit"
        disabled={loading || pairBlocked}
        className="w-full bg-amber text-void hover:bg-amber-light"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Analyzing route…
          </>
        ) : (
          <>
            {submitLabel}
            <ArrowRight className="size-4" data-icon="inline-end" />
          </>
        )}
      </Button>
    </form>
  );
}
