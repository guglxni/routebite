import { describe, expect, test } from 'bun:test';
import { calculateAutoPlaceTiming } from '../../src/services/order/timing';
import { TIMING } from '@routebite/shared/constants';

describe('calculateAutoPlaceTiming', () => {
  test('uses shared timing formula', () => {
    const interceptETA = 3600;
    const prepTime = 900;
    const riderTravel = 600;

    const result = calculateAutoPlaceTiming(interceptETA, prepTime, riderTravel);
    const expected = TIMING.AUTO_PLACE_FORMULA(interceptETA, prepTime, riderTravel);

    expect(result.autoPlaceTime).toBe(expected);
    expect(result.safetyBuffer).toBe(TIMING.SAFETY_BUFFER_S);
    expect(result.trafficBuffer).toBe(TIMING.TRAFFIC_BUFFER_S);
  });
});
