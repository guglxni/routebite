/**
 * Train / dwell halt gate: only place if halt window covers prep + rider + buffer.
 */
export interface HaltGateInput {
  dwellSeconds: number;
  prepSeconds: number;
  riderTravelSeconds: number;
  safetyBufferSeconds?: number;
  trafficBufferSeconds?: number;
  weatherBufferSeconds?: number;
  transportMode?: string;
}

export interface HaltGateResult {
  ok: boolean;
  requiredSeconds: number;
  dwellSeconds: number;
  slackSeconds: number;
  severity: 'ok' | 'tight' | 'fail';
  message: string;
  recommendation?: string;
}

export function evaluateHaltGate(input: HaltGateInput): HaltGateResult {
  const safety = input.safetyBufferSeconds ?? 120;
  const traffic = input.trafficBufferSeconds ?? 60;
  const weather = input.weatherBufferSeconds ?? 0;
  const required =
    input.prepSeconds + input.riderTravelSeconds + safety + traffic + weather;
  const dwell = Math.max(0, input.dwellSeconds);
  const slack = dwell - required;
  const isTrain = input.transportMode === 'train';

  if (slack >= 180) {
    return {
      ok: true,
      requiredSeconds: required,
      dwellSeconds: dwell,
      slackSeconds: slack,
      severity: 'ok',
      message: `Halt ${Math.round(dwell / 60)} min covers delivery window (${Math.round(required / 60)} min).`,
    };
  }
  if (slack >= 0) {
    return {
      ok: true,
      requiredSeconds: required,
      dwellSeconds: dwell,
      slackSeconds: slack,
      severity: 'tight',
      message: `Tight ${Math.round(dwell / 60)} min halt — place soon; only ${Math.round(slack / 60)} min slack.`,
      recommendation: isTrain
        ? 'Prefer auto-place now so food meets the train window.'
        : 'Use auto-place and stay near the intercept.',
    };
  }
  return {
    ok: false,
    requiredSeconds: required,
    dwellSeconds: dwell,
    slackSeconds: slack,
    severity: 'fail',
    message: `Halt ${Math.round(dwell / 60)} min is shorter than needed ${Math.round(required / 60)} min delivery window.`,
    recommendation: isTrain
      ? 'Pick the next station with a longer halt, or order Instamart essentials only.'
      : 'Choose a later intercept with more dwell, or a closer kitchen.',
  };
}
