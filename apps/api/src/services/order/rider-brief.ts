import type { TransportMode, VehicleDetails } from '@routebite/shared/types';
import { VehicleDetailsSchema } from '@routebite/shared/schemas';

export function parseVehicleDetails(json: string | null | undefined): VehicleDetails | null {
  if (!json) return null;
  try {
    return VehicleDetailsSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * Short instructions shown to the Swiggy delivery partner (landmark / delivery notes).
 */
export function buildRiderBrief(
  transportMode: TransportMode,
  vehicle: VehicleDetails,
  interceptLabel?: string
): string {
  const lines: string[] = ['RouteBite intercept delivery — customer is en route.'];

  if (interceptLabel) {
    lines.push(`Meet at: ${interceptLabel}.`);
  }

  switch (transportMode) {
    case 'car':
      if (vehicle.plateNumber) lines.push(`Vehicle: ${vehicle.plateNumber.toUpperCase()}`);
      if (vehicle.model) lines.push(`Model: ${vehicle.model}`);
      if (vehicle.color) lines.push(`Color: ${vehicle.color}`);
      break;
    case 'bike':
      if (vehicle.plateNumber) lines.push(`Bike plate: ${vehicle.plateNumber.toUpperCase()}`);
      if (vehicle.model) lines.push(`Model: ${vehicle.model}`);
      if (vehicle.color) lines.push(`Color: ${vehicle.color}`);
      break;
    case 'bus':
      if (vehicle.busRouteNumber) lines.push(`Bus route: ${vehicle.busRouteNumber}`);
      if (vehicle.busOperator) lines.push(`Operator: ${vehicle.busOperator}`);
      if (vehicle.plateNumber) lines.push(`Plate: ${vehicle.plateNumber.toUpperCase()}`);
      if (vehicle.color) lines.push(`Color: ${vehicle.color}`);
      break;
    case 'train':
      if (vehicle.trainNumber) lines.push(`Train: ${vehicle.trainNumber}${vehicle.trainName ? ` (${vehicle.trainName})` : ''}`);
      if (vehicle.coach) lines.push(`Coach: ${vehicle.coach}`);
      if (vehicle.seatBerth) lines.push(`Seat/Berth: ${vehicle.seatBerth}`);
      break;
    default:
      if (vehicle.description) lines.push(vehicle.description);
  }

  if (vehicle.liveLocationSharing && vehicle.liveLocation) {
    lines.push('Customer is sharing live GPS — check map pin for their position.');
  } else {
    lines.push('Customer will arrive at the intercept pin; call if you cannot spot them.');
  }

  return lines.join(' ');
}
