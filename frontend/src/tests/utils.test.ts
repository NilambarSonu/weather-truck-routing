import { describe, it, expect } from 'vitest';
import { createColorRamp, formatDuration, formatDateTime, toLocalISO } from '../lib/colors';
import { decodePolyline } from '../lib/polyline';
import { useTripStore } from '../state/useTripStore';

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
