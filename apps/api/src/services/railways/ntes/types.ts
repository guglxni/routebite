/** Parsed station stop from NTES schedule or live run (STNS). */
export type TrainStationStop = {
  stationCode: string;
  stationName: string;
  sequence: number;
  platform?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  expectedArrival?: string;
  expectedDeparture?: string;
  arrivalDelay?: string;
  departureDelay?: string;
  haltSeconds: number;
  distanceKm: number;
  /** Seconds from now until expected departure (for delivery window) */
  etaSeconds?: number;
  passed: boolean;
  lat?: number;
  lng?: number;
};

export type TrainRunSnapshot = {
  trainNumber: string;
  trainName?: string;
  startDate: string;
  sourceStation?: string;
  destinationStation?: string;
  delayMinutes?: number;
  currentStationCode?: string;
  currentStationName?: string;
  nextStationCode?: string;
  nextStationName?: string;
  lastUpdate?: string;
  stations: TrainStationStop[];
  updatedAt: string;
  source: 'ntes' | 'unavailable';
  fallbackUrl: string;
};

/** Raw NTES STNS row from ShowFullRunJson */
export type NtesRunStationRow = {
  SC?: string;
  SN?: string;
  STA?: string;
  STD?: string;
  ETA?: string;
  ETD?: string;
  PF?: string;
  DARR?: string;
  DDEP?: string;
  DIST?: number | string;
  Sr?: string | number;
  Halt?: number;
};

/** Raw NTES schedule station row */
export type NtesScheduleStationRow = {
  StationCode?: string;
  StationName?: string;
  STA?: string;
  STD?: string;
  Halt?: number;
  Distance?: string | number;
  Sr?: number;
};
