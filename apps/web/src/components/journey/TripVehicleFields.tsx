import type { TransportMode } from "@routebite/shared/types";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { VehicleFormState } from "~/lib/vehicle-details";

type TripVehicleFieldsProps = {
  mode: TransportMode;
  value: VehicleFormState;
  onChange: (next: VehicleFormState) => void;
};

export function TripVehicleFields({ mode, value, onChange }: TripVehicleFieldsProps) {
  const set = (key: keyof VehicleFormState, v: string) =>
    onChange({ ...value, [key]: v });

  if (mode === "train") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="trainNumber">Train number (5 digits)</Label>
          <Input
            id="trainNumber"
            inputMode="numeric"
            maxLength={5}
            placeholder="e.g. 12301"
            value={value.trainNumber}
            onChange={(e) => set("trainNumber", e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="bg-surface-raised border-border-subtle font-mono"
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="trainName">Train name (optional)</Label>
          <Input
            id="trainName"
            placeholder="e.g. Rajdhani Express"
            value={value.trainName}
            onChange={(e) => set("trainName", e.target.value)}
            className="bg-surface-raised border-border-subtle"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="coach">Coach / class</Label>
          <Input
            id="coach"
            placeholder="B1 / SL"
            value={value.coach}
            onChange={(e) => set("coach", e.target.value)}
            className="bg-surface-raised border-border-subtle"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="seatBerth">Seat / berth</Label>
          <Input
            id="seatBerth"
            placeholder="S3 / 42"
            value={value.seatBerth}
            onChange={(e) => set("seatBerth", e.target.value)}
            className="bg-surface-raised border-border-subtle"
          />
        </div>
      </div>
    );
  }

  if (mode === "bus") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="plateNumber">Bus plate number</Label>
          <Input
            id="plateNumber"
            placeholder="KA-01-AB-1234"
            value={value.plateNumber}
            onChange={(e) => set("plateNumber", e.target.value.toUpperCase())}
            className="bg-surface-raised border-border-subtle font-mono uppercase"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="busRouteNumber">Route / service no.</Label>
          <Input
            id="busRouteNumber"
            placeholder="e.g. KBS-298"
            value={value.busRouteNumber}
            onChange={(e) => set("busRouteNumber", e.target.value)}
            className="bg-surface-raised border-border-subtle"
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="busOperator">Operator (optional)</Label>
          <Input
            id="busOperator"
            placeholder="KSRTC, SRS, private"
            value={value.busOperator}
            onChange={(e) => set("busOperator", e.target.value)}
            className="bg-surface-raised border-border-subtle"
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="color">Bus color (optional)</Label>
          <Input
            id="color"
            placeholder="Red AC sleeper"
            value={value.color}
            onChange={(e) => set("color", e.target.value)}
            className="bg-surface-raised border-border-subtle"
          />
        </div>
      </div>
    );
  }

  // car or bike
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="plateNumber">Plate number</Label>
        <Input
          id="plateNumber"
          placeholder="KA-01-AB-1234"
          value={value.plateNumber}
          onChange={(e) => set("plateNumber", e.target.value.toUpperCase())}
          className="bg-surface-raised border-border-subtle font-mono uppercase"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="model">Model (optional)</Label>
        <Input
          id="model"
          placeholder={mode === "bike" ? "Activa 6G" : "Swift / Creta"}
          value={value.model}
          onChange={(e) => set("model", e.target.value)}
          className="bg-surface-raised border-border-subtle"
        />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="color">Color (optional)</Label>
        <Input
          id="color"
          placeholder="White"
          value={value.color}
          onChange={(e) => set("color", e.target.value)}
          className="bg-surface-raised border-border-subtle"
        />
      </div>
    </div>
  );
}
