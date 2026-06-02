/** Extract IR station code from intercept name, e.g. "KANPUR CENTRAL (CNB)". */
const STATION_CODE_RE = /\(([A-Z]{2,5})\)\s*$/;

export function parseStationCodeFromLabel(label?: string | null): string | undefined {
  if (!label) return undefined;
  return label.match(STATION_CODE_RE)?.[1];
}
