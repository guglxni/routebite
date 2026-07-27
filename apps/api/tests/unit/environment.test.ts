import { describe, expect, test } from 'bun:test';
import {
  applyEnvironmentToSafetyRating,
  buildEnvironmentContext,
} from '../../src/services/environment/client';
import { MAPS_CONFIG } from '@routebite/shared/constants';

describe('buildEnvironmentContext', () => {
  test('does NOT flag Excellent UAQI (higher = better)', () => {
    const ctx = buildEnvironmentContext(
      {
        uaqi: 85,
        category: 'Excellent air quality',
        dominantPollutant: 'o3',
        source: 'google_air_quality',
      },
      undefined
    );
    expect(ctx.outdoorRisk).toBe(false);
    expect(ctx.safetyPenalty).toBe(0);
  });

  test('penalizes Low/Poor UAQI below MIN_OK', () => {
    const ctx = buildEnvironmentContext(
      {
        uaqi: 25,
        category: 'Low air quality',
        source: 'google_air_quality',
      },
      undefined
    );
    expect(ctx.outdoorRisk).toBe(true);
    expect(ctx.safetyPenalty).toBeGreaterThanOrEqual(MAPS_CONFIG.AIR_QUALITY_SAFETY_PENALTY);
    expect(ctx.riskTitles[0]).toContain('Air quality');
  });

  test('penalizes elevated India CPCB NAQI', () => {
    const ctx = buildEnvironmentContext(
      {
        uaqi: 70,
        category: 'Good air quality',
        source: 'google_air_quality',
        local: {
          code: 'ind_cpcb',
          displayName: 'NAQI (IN)',
          aqi: 160,
          category: 'Unhealthy',
        },
      },
      undefined
    );
    expect(ctx.outdoorRisk).toBe(true);
    expect(ctx.riskTitles.some((t) => /NAQI/i.test(t))).toBe(true);
  });

  test('penalizes elevated pollen', () => {
    const ctx = buildEnvironmentContext(undefined, {
      maxIndex: MAPS_CONFIG.POLLEN_INDEX_WARNING,
      plantDescriptions: ['Grass'],
      source: 'google_pollen',
    });
    expect(ctx.outdoorRisk).toBe(true);
    expect(ctx.safetyPenalty).toBeGreaterThanOrEqual(MAPS_CONFIG.POLLEN_SAFETY_PENALTY);
  });

  test('clear air and pollen → no penalty', () => {
    const ctx = buildEnvironmentContext(
      { uaqi: 75, category: 'Good air quality', source: 'google_air_quality' },
      { maxIndex: 1, source: 'google_pollen' }
    );
    expect(ctx.outdoorRisk).toBe(false);
    expect(ctx.safetyPenalty).toBe(0);
  });
});

describe('applyEnvironmentToSafetyRating', () => {
  test('clamps between 1 and 5', () => {
    expect(
      applyEnvironmentToSafetyRating(5, {
        safetyPenalty: 10,
        outdoorRisk: true,
        riskTitles: ['x'],
      })
    ).toBe(1);
  });
});
