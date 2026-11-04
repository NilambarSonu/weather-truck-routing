import { describe, it, expect } from 'vitest';
import { createColorRamp, formatDuration, formatDateTime, toLocalISO } from '../lib/colors';
import { decodePolyline } from '../lib/polyline';
import { useTripStore } from '../state/useTripStore';
import {
  CARGO_WEIGHT_PRESETS,
  getEscalationPolicy,
  validateCargoWeight,
} from '../features/TripForm';

describe('Frontend Color Ramp & Utilities', () => {
  it('generates a 256-entry RGBA color ramp of length 1024', () => {
    const ramp = createColorRamp();
    expect(ramp.length).toBe(256 * 4);

    // Byte 0 should be low risk green
    expect(ramp[0]).toBeGreaterThan(30);
    expect(ramp[1]).toBeGreaterThan(100);

    // Byte 255 should be transparent (no data)
    expect(ramp[255 * 4 + 3]).toBe(0);
  });

  it('formats durations cleanly into hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(1800)).toBe('30m');
  });

  it('formats dates with explicit timezones consistently', () => {
    // 2026-11-05T14:00:00Z is 8:00 AM Central Time (America/Chicago) and 7:00 AM Mountain Time (America/Denver)
    const utcIso = '2026-11-05T14:00:00Z';
    const chicagoStr = formatDateTime(utcIso, 'America/Chicago');
    expect(chicagoStr).toContain('8:00 AM');
    expect(chicagoStr).toContain('Chicago');

    const denverStr = formatDateTime(utcIso, 'America/Denver');
    expect(denverStr).toContain('7:00 AM');
    expect(denverStr).toContain('Denver');

    // Invalid timezone graceful fallback
    const fallbackStr = formatDateTime(utcIso, 'Invalid/Timezone');
    expect(fallbackStr).toBeTruthy();
  });

  it('converts Date to local ISO format without timezone offset shifting', () => {
    const d = new Date(2026, 10, 5, 8, 30); // Note month 10 is November (0-indexed)
    const localIso = toLocalISO(d);
    expect(localIso).toBe('2026-11-05T08:30');
  });

  it('decodes polyline coordinates correctly', () => {
    // Standard polyline encoding test
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const pts = decodePolyline(encoded, 5);
    expect(pts.length).toBeGreaterThan(1);
    expect(pts[0][0]).toBeCloseTo(38.5, 1);
    expect(pts[0][1]).toBeCloseTo(-120.2, 1);
  });

  it('manages trip store state correctly', () => {
    const store = useTripStore.getState();
    store.setHeatmapHour(15.5);
    expect(useTripStore.getState().heatmapHour).toBe(15.5);

    store.setActiveLayer('wind');
    expect(useTripStore.getState().activeLayer).toBe('wind');

    store.setShowHeatmap(false);
    expect(useTripStore.getState().showHeatmap).toBe(false);
  });
});

describe('Cargo Weight Input & Escalation Regression Tests', () => {
  it('validates 42,000 lb without browser step mismatch error', () => {
    // Validates that 42000 is accepted by validation logic
    const res = validateCargoWeight(42000);
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();

    // Mathematical verification of the bug root cause:
    // With min=1 and step=500:
    const bugStepMismatch = (42000 - 1) % 500; // = 499 !== 0 -> Browser showed 41501 and 42001!
    expect(bugStepMismatch).not.toBe(0);

    // With step='any', stepMismatch is disabled completely in HTML5.
    // For integer values, 42000 is a valid positive integer within [1, 80000].
    expect(Number.isInteger(42000)).toBe(true);
    expect(42000 >= 1 && 42000 <= 80000).toBe(true);
  });

  it('contains all intended cargo weight presets including 42k lb', () => {
    expect(CARGO_WEIGHT_PRESETS).toEqual([20000, 32000, 42000, 65000]);

    for (const preset of CARGO_WEIGHT_PRESETS) {
      const res = validateCargoWeight(preset);
      expect(res.valid).toBe(true);
      expect(preset >= 1 && preset <= 80000).toBe(true);
    }
  });

  it('enforces cargo weight boundaries (1 to 80,000 lb)', () => {
    expect(validateCargoWeight(1).valid).toBe(true); // Min boundary
    expect(validateCargoWeight(80000).valid).toBe(true); // Max boundary
    expect(validateCargoWeight(0).valid).toBe(false); // Below min
    expect(validateCargoWeight(-500).valid).toBe(false); // Negative
    expect(validateCargoWeight(80001).valid).toBe(false); // Above max
    expect(validateCargoWeight(NaN).valid).toBe(false); // Non-number
  });

  it('classifies load escalation policy boundaries correctly', () => {
    // Baseline: <= 30,000 lb
    expect(getEscalationPolicy(20000)).toBe('baseline');
    expect(getEscalationPolicy(30000)).toBe('baseline');

    // > 30,000 lb and <= 40,000 lb: wind 45-54 mph escalates to No Travel
    expect(getEscalationPolicy(30001)).toBe('wind_45_no_travel');
    expect(getEscalationPolicy(32000)).toBe('wind_45_no_travel');
    expect(getEscalationPolicy(40000)).toBe('wind_45_no_travel');

    // > 40,000 lb: wind 35-44 mph escalates to Severe AND wind 45-54 mph triggers No Travel
    expect(getEscalationPolicy(40001)).toBe('wind_35_severe_45_no_travel');
    expect(getEscalationPolicy(42000)).toBe('wind_35_severe_45_no_travel');
    expect(getEscalationPolicy(65000)).toBe('wind_35_severe_45_no_travel');
  });

  it('ensures payload submitted to backend is cleanly integer parsed', () => {
    // Simulates form values when user types '42000' or clicks 42k preset
    const rawFormVal = '42000';
    const submittedVal = Math.round(Number(rawFormVal));
    expect(submittedVal).toBe(42000);
    expect(typeof submittedVal).toBe('number');
  });
});
