import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { TransportMode } from "@routebite/shared/types";
import { LiveLocationPanel } from "~/components/journey/LiveLocationPanel";
import { TrainStatusPanel } from "~/components/journey/TrainStatusPanel";
import { TripVehicleFields } from "~/components/journey/TripVehicleFields";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  emptyVehicleForm,
  formToVehicleDetails,
  type VehicleFormState,
} from "~/lib/vehicle-details";
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
};

export function QuickRouteForm({
  datalistId = "rb-places",
  submitLabel = "Find intercepts",
  onSuccess,
}: QuickRouteFormProps) {
  const { buildJourney, loading, pushLiveLocation, updateTelemetry, liveLocationSharing, setLiveLocationSharing } =
    useJourney();

  const [from, setFrom] = useState("Koramangala, Bengaluru");
  const [to, setTo] = useState("Whitefield, Bengaluru");
  const [mode, setMode] = useState<TransportMode>("car");
  const [vehicle, setVehicle] = useState<VehicleFormState>(emptyVehicleForm);
  const [shareLocation, setShareLocation] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    try {
      const vehicleDetails = formToVehicleDetails(mode, vehicle);
      await buildJourney({
        originAddress: from.trim(),
        destinationAddress: to.trim(),
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="origin">Origin</Label>
        <Input
          id="origin"
          list={datalistId}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Where are you starting?"
          className="bg-surface-raised border-border-subtle"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="destination">Destination</Label>
        <Input
          id="destination"
          list={datalistId}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Where are you headed?"
          className="bg-surface-raised border-border-subtle"
          required
        />
      </div>
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

      <Button type="submit" disabled={loading} className="w-full bg-amber text-void hover:bg-amber-light">
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
