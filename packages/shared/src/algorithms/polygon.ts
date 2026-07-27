import type { GeoPoint } from './geo';

/** GeoJSON position is [longitude, latitude] per RFC 7946. */
export type GeoJsonPosition = [number, number];

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: GeoJsonPosition[][];
};

export type GeoJsonMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: GeoJsonPosition[][][];
};

export type GeoJsonPolygonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

/**
 * Ray-casting point-in-ring test. Ring is closed or open; GeoJSON [lng, lat].
 * O(v) in ring vertex count.
 */
export function pointInRing(point: GeoPoint, ring: GeoJsonPosition[]): boolean {
  if (ring.length < 3) return false;
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/** Exterior ring + holes (odd-even): point must be in exterior and outside all holes. */
export function pointInPolygon(point: GeoPoint, polygon: GeoJsonPolygon): boolean {
  const rings = polygon.coordinates;
  if (!rings.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

export function pointInMultiPolygon(point: GeoPoint, multi: GeoJsonMultiPolygon): boolean {
  return multi.coordinates.some((coords) =>
    pointInPolygon(point, { type: 'Polygon', coordinates: coords })
  );
}

export function pointInGeoJson(point: GeoPoint, geometry: GeoJsonPolygonGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry);
  return pointInMultiPolygon(point, geometry);
}

/** Count how many points fall inside a GeoJSON polygon/multipolygon. */
export function countPointsInGeoJson(
  points: GeoPoint[],
  geometry: GeoJsonPolygonGeometry
): number {
  let n = 0;
  for (const p of points) {
    if (pointInGeoJson(p, geometry)) n++;
  }
  return n;
}

/**
 * Approximate polygon area in m² using equirectangular projection on the exterior ring.
 * Adequate for relative scoring (isochrone vs circle), not cadastral survey.
 */
export function approxPolygonAreaM2(geometry: GeoJsonPolygonGeometry): number {
  const rings: GeoJsonPosition[][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0] ?? []]
      : geometry.coordinates.map((poly) => poly[0] ?? []);

  let total = 0;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
    const mPerDegLat = 111_320;
    const mPerDegLng = 111_320 * Math.cos(lat0);

    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0] * mPerDegLng;
      const yi = ring[i][1] * mPerDegLat;
      const xj = ring[j][0] * mPerDegLng;
      const yj = ring[j][1] * mPerDegLat;
      area += xj * yi - xi * yj;
    }
    total += Math.abs(area) / 2;
  }
  return total;
}

/** Bounding box [minLng, minLat, maxLng, maxLat] for fitBounds / Places radius. */
export function geoJsonBoundingBox(
  geometry: GeoJsonPolygonGeometry
): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let any = false;

  const visit = (pos: GeoJsonPosition) => {
    any = true;
    minLng = Math.min(minLng, pos[0]);
    maxLng = Math.max(maxLng, pos[0]);
    minLat = Math.min(minLat, pos[1]);
    maxLat = Math.max(maxLat, pos[1]);
  };

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) for (const p of ring) visit(p);
  } else {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) for (const p of ring) visit(p);
    }
  }

  return any ? [minLng, minLat, maxLng, maxLat] : null;
}

/** Haversine radius (m) covering the bbox diagonal / 2 from center — for Nearby search. */
export function boundingRadiusMeters(
  center: GeoPoint,
  bbox: [number, number, number, number]
): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const corners: GeoPoint[] = [
    { lat: minLat, lng: minLng },
    { lat: minLat, lng: maxLng },
    { lat: maxLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
  ];
  let max = 0;
  for (const c of corners) {
    const d = haversineQuick(center, c);
    if (d > max) max = d;
  }
  return Math.ceil(max * 1.05);
}

function haversineQuick(a: GeoPoint, b: GeoPoint): number {
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Decimate rings for wire/DB storage — keep every Nth vertex plus endpoints.
 * Preserves topology well enough for map overlays at city scale.
 */
export function simplifyGeoJson(
  geometry: GeoJsonPolygonGeometry,
  stride = 3
): GeoJsonPolygonGeometry {
  if (stride <= 1) return geometry;

  const simplifyRing = (ring: GeoJsonPosition[]): GeoJsonPosition[] => {
    if (ring.length <= 4) return ring;
    const out: GeoJsonPosition[] = [];
    for (let i = 0; i < ring.length; i++) {
      if (i === 0 || i === ring.length - 1 || i % stride === 0) out.push(ring[i]);
    }
    // Ensure closed
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([...first] as GeoJsonPosition);
    return out;
  };

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(simplifyRing),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((poly) => poly.map(simplifyRing)),
  };
}
