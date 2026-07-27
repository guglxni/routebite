import { describe, expect, test } from "bun:test";
import {
  circlePolygon,
  classifySuggestionDistance,
  evaluateJourneyPair,
  formatDistanceKm,
} from "../src/lib/journey-distance";

describe("evaluateJourneyPair", () => {
  test("rejects Nexus Seawoods ↔ NRI Complex style short hop", () => {
    // ~1.2 km apart in Seawoods
    const a = { lat: 19.0216, lng: 73.0188 };
    const b = { lat: 19.0145, lng: 73.0225 };
    const result = evaluateJourneyPair(a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_short");
  });

  test("accepts Koramangala ↔ Whitefield (~15 km)", () => {
    const a = { lat: 12.9352, lng: 77.6245 };
    const b = { lat: 12.9698, lng: 77.75 };
    const result = evaluateJourneyPair(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.distanceM).toBeGreaterThan(5000);
  });

  test("rejects ultra-long pairs", () => {
    const a = { lat: 12.97, lng: 77.59 };
    const b = { lat: 28.61, lng: 77.21 }; // Bengaluru → Delhi
    const result = evaluateJourneyPair(a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_long");
  });
});

describe("classifySuggestionDistance", () => {
  test("greys out under 5 km", () => {
    expect(classifySuggestionDistance(1200)).toBe("too_short");
    expect(classifySuggestionDistance(4999)).toBe("too_short");
    expect(classifySuggestionDistance(5000)).toBe("ok");
    expect(classifySuggestionDistance(600_000)).toBe("too_long");
    expect(classifySuggestionDistance(undefined)).toBe("unknown");
  });
});

describe("helpers", () => {
  test("formatDistanceKm", () => {
    expect(formatDistanceKm(5000)).toBe("5.0 km");
    expect(formatDistanceKm(800)).toBe("800 m");
  });

  test("circlePolygon closes ring", () => {
    const poly = circlePolygon({ lat: 19.02, lng: 73.02 }, 5000, 32);
    expect(poly.type).toBe("Polygon");
    const ring = poly.coordinates[0]!;
    expect(ring.length).toBe(33);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});
