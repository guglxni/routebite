import { describe, expect, test } from 'bun:test';
import {
  applyWeatherToSafetyRating,
  buildWeatherContext,
} from '../../src/services/weather/client';
import { MAPS_CONFIG } from '@routebite/shared/constants';

describe('buildWeatherContext', () => {
  test('applies safety penalty and timing buffer for heavy precipitation', () => {
    const ctx = buildWeatherContext(
      { precipitationProbability: MAPS_CONFIG.WEATHER_PRECIP_WARNING_PCT },
      { hasActiveAlert: false }
    );
    expect(ctx.safetyPenalty).toBeGreaterThan(0);
    expect(ctx.timingBufferSeconds).toBe(MAPS_CONFIG.WEATHER_TIMING_BUFFER_S);
  });

  test('applies penalty for active weather alerts', () => {
    const ctx = buildWeatherContext(undefined, {
      hasActiveAlert: true,
      alertTitle: 'Heavy Rain Warning',
    });
    expect(ctx.safetyPenalty).toBeGreaterThanOrEqual(MAPS_CONFIG.WEATHER_SAFETY_PENALTY);
    expect(ctx.alerts?.alertTitle).toBe('Heavy Rain Warning');
  });

  test('returns zero penalties for clear weather', () => {
    const ctx = buildWeatherContext(
      { precipitationProbability: 10, visibilityMeters: 8000 },
      { hasActiveAlert: false }
    );
    expect(ctx.safetyPenalty).toBe(0);
    expect(ctx.timingBufferSeconds).toBe(0);
  });

  test('penalizes low visibility', () => {
    const ctx = buildWeatherContext({ visibilityMeters: 500 }, { hasActiveAlert: false });
    expect(ctx.safetyPenalty).toBeGreaterThan(0);
  });
});

describe('applyWeatherToSafetyRating', () => {
  test('clamps rating between 1 and 5', () => {
    expect(applyWeatherToSafetyRating(5, { safetyPenalty: 10, timingBufferSeconds: 0 })).toBe(1);
    expect(applyWeatherToSafetyRating(1, { safetyPenalty: 0, timingBufferSeconds: 0 })).toBe(1);
  });

  test('reduces rating by safety penalty', () => {
    const ctx = buildWeatherContext(
      { precipitationProbability: 90 },
      { hasActiveAlert: false }
    );
    const adjusted = applyWeatherToSafetyRating(4, ctx);
    expect(adjusted).toBeLessThan(4);
    expect(adjusted).toBeGreaterThanOrEqual(1);
  });
});
