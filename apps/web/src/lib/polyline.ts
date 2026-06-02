export type LatLng = { lat: number; lng: number };

/** Decode Google encoded polyline into lat/lng points. */
export function decodePolyline(encoded: string): LatLng[] {
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

export function toMapCoordinates(points: LatLng[]): [number, number][] {
  return points.map((p) => [p.lng, p.lat]);
}

export function boundsFromPoints(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLng = points[0]!.lng;
  let maxLng = points[0]!.lng;
  let minLat = points[0]!.lat;
  let maxLat = points[0]!.lat;

  for (const p of points) {
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
