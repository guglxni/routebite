import { describe, expect, test } from "bun:test";
import { decodePolyline, toMapCoordinates, boundsFromPoints } from "../src/lib/polyline";

describe("polyline utilities", () => {
  test("decodePolyline returns lat/lng points", () => {
    // Encoded polyline for a short segment near Bengaluru (from Google polyline algorithm)
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    const points = decodePolyline(encoded);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0]!.lat).toBeCloseTo(38.5, 0);
    expect(points[0]!.lng).toBeCloseTo(-120.2, 0);
  });

  test("toMapCoordinates swaps to lng,lat tuples", () => {
    const coords = toMapCoordinates([
      { lat: 12.97, lng: 77.59 },
      { lat: 12.98, lng: 77.6 },
    ]);
    expect(coords[0]).toEqual([77.59, 12.97]);
  });

  test("boundsFromPoints computes bounding box", () => {
    const bounds = boundsFromPoints([
      { lat: 12, lng: 77 },
      { lat: 13, lng: 78 },
    ]);
    expect(bounds).toEqual([
      [77, 12],
      [78, 13],
    ]);
  });
});
