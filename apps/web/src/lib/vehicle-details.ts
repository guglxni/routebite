import type { TransportMode, VehicleDetails } from "@routebite/shared/types";

export type VehicleFormState = {
  plateNumber: string;
  model: string;
  color: string;
  busRouteNumber: string;
  busOperator: string;
  trainNumber: string;
  trainName: string;
  coach: string;
  seatBerth: string;
};

export const emptyVehicleForm = (): VehicleFormState => ({
  plateNumber: "",
  model: "",
  color: "",
  busRouteNumber: "",
  busOperator: "",
  trainNumber: "",
  trainName: "",
  coach: "",
  seatBerth: "",
});

export function buildVehicleDescription(mode: TransportMode, form: VehicleFormState): string {
  const parts: string[] = [];
  if (form.plateNumber.trim()) parts.push(`plate ${form.plateNumber.trim().toUpperCase()}`);
  if (form.model.trim()) parts.push(form.model.trim());
  if (form.color.trim()) parts.push(form.color.trim());
  if (mode === "bus" && form.busRouteNumber.trim()) parts.push(`route ${form.busRouteNumber.trim()}`);
  if (mode === "bus" && form.busOperator.trim()) parts.push(form.busOperator.trim());
  if (mode === "train" && form.trainNumber.trim()) parts.push(`train ${form.trainNumber.trim()}`);
  if (mode === "train" && form.trainName.trim()) parts.push(form.trainName.trim());
  if (mode === "train" && form.coach.trim()) parts.push(`coach ${form.coach.trim()}`);
  if (parts.length === 0) return `${mode} journey on RouteBite`;
  return parts.join(" · ");
}

export function formToVehicleDetails(
  mode: TransportMode,
  form: VehicleFormState,
): VehicleDetails {
  const base: VehicleDetails = {
    description: buildVehicleDescription(mode, form),
  };
  const plate = form.plateNumber.trim().toUpperCase();
  if (plate && ["car", "bus", "bike"].includes(mode)) base.plateNumber = plate;
  if (form.model.trim() && ["car", "bike"].includes(mode)) base.model = form.model.trim();
  if (form.color.trim()) base.color = form.color.trim();
  if (mode === "bus") {
    if (form.busRouteNumber.trim()) base.busRouteNumber = form.busRouteNumber.trim();
    if (form.busOperator.trim()) base.busOperator = form.busOperator.trim();
  }
  if (mode === "train") {
    if (form.trainNumber.trim()) base.trainNumber = form.trainNumber.trim();
    if (form.trainName.trim()) base.trainName = form.trainName.trim();
    if (form.coach.trim()) base.coach = form.coach.trim();
    if (form.seatBerth.trim()) base.seatBerth = form.seatBerth.trim();
  }
  return base;
}

export function vehicleDetailsToForm(details?: VehicleDetails | null): VehicleFormState {
  if (!details) return emptyVehicleForm();
  return {
    plateNumber: details.plateNumber ?? "",
    model: details.model ?? "",
    color: details.color ?? "",
    busRouteNumber: details.busRouteNumber ?? "",
    busOperator: details.busOperator ?? "",
    trainNumber: details.trainNumber ?? "",
    trainName: details.trainName ?? "",
    coach: details.coach ?? "",
    seatBerth: details.seatBerth ?? "",
  };
}
