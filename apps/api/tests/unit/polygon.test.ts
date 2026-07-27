import { describe, expect, test } from 'bun:test';
import {
  pointInGeoJson,
  approxPolygonAreaM2,
  countPointsInGeoJson,
  geoJsonBoundingBox,
  simplifyGeoJson,
  type GeoJsonMultiPolygon,
} from '@routebite/shared/algorithms';

const square: GeoJsonMultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [77.0, 28.0],
        [77.1, 28.0],
        [77.1, 28.1],
        [77.0, 28.1],
        [77.0, 28.0],
      ],
    ],
  ],
};

describe('pointInGeoJson', () => {
  test('detects points inside and outside a square multipolygon', () => {
    expect(pointInGeoJson({ lat: 28.05, lng: 77.05 }, square)).toBe(true);
    expect(pointInGeoJson({ lat: 28.2, lng: 77.05 }, square)).toBe(false);
    expect(pointInGeoJson({ lat: 28.05, lng: 77.2 }, square)).toBe(false);
  });

  test('respects holes (odd-even)', () => {
    const withHole: GeoJsonMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          [
            [3, 3],
            [7, 3],
            [7, 7],
            [3, 7],
            [3, 3],
          ],
        ],
      ],
    };
    expect(pointInGeoJson({ lat: 1, lng: 1 }, withHole)).toBe(true);
    expect(pointInGeoJson({ lat: 5, lng: 5 }, withHole)).toBe(false);
  });
});

describe('countPointsInGeoJson / area / bbox', () => {
  test('counts members inside polygon', () => {
    const pts = [
      { lat: 28.05, lng: 77.05 },
      { lat: 28.2, lng: 77.05 },
      { lat: 28.04, lng: 77.04 },
    ];
    expect(countPointsInGeoJson(pts, square)).toBe(2);
  });

  test('approx area is positive', () => {
    expect(approxPolygonAreaM2(square)).toBeGreaterThan(1e6);
  });

  test('bbox and simplify', () => {
    const bbox = geoJsonBoundingBox(square);
    expect(bbox).toEqual([77.0, 28.0, 77.1, 28.1]);
    const simplified = simplifyGeoJson(square, 2);
    expect(simplified.type).toBe('MultiPolygon');
  });
});
