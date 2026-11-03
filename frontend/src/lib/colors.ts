import { RiskLevel } from '../api/types';

export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: '#2E9E5B',
  MODERATE: '#F2C230',
  HIGH: '#F08A24',
  SEVERE: '#D93A2B',
  NO_TRAVEL: '#1B1B1B',
};

export const RISK_BG_CLASSES: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40',
  MODERATE: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  SEVERE: 'bg-red-600/20 text-red-400 border-red-500/40',
  NO_TRAVEL: 'bg-zinc-900 text-red-300 border-red-600/80',
};

export const RISK_BADGE_SOLID: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-600 text-white',
  MODERATE: 'bg-amber-500 text-zinc-950 font-semibold',
  HIGH: 'bg-orange-500 text-white',
  SEVERE: 'bg-red-600 text-white',
  NO_TRAVEL: 'bg-zinc-900 text-red-400 border border-red-500/60',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  SEVERE: 'Severe',
  NO_TRAVEL: 'No Travel',
};

// 256-entry RGBA color ramp for deck.gl H3HexagonLayer
// Precomputed to allow instant, zero-allocation lookup per cell per frame
export function createColorRamp(): Uint8Array {
  const ramp = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const offset = i * 4;
    if (i >= 245) {
      // 255 = No Data / Transparent
      ramp[offset] = 0;
      ramp[offset + 1] = 0;
      ramp[offset + 2] = 0;
      ramp[offset + 3] = 0;
    } else if (i < 60) {
      // 0..60: Green to Amber (Low to Moderate)
      const f = i / 60.0;
      ramp[offset] = Math.round(46 + f * (242 - 46));
      ramp[offset + 1] = Math.round(158 + f * (194 - 158));
      ramp[offset + 2] = Math.round(91 + f * (48 - 91));
      ramp[offset + 3] = Math.round(90 + f * 40); // Opacity ~35-50%
    } else if (i < 120) {
      // 60..120: Amber to Orange (Moderate to High)
      const f = (i - 60) / 60.0;
      ramp[offset] = Math.round(242 + f * (240 - 242));
      ramp[offset + 1] = Math.round(194 + f * (138 - 194));
      ramp[offset + 2] = Math.round(48 + f * (36 - 48));
      ramp[offset + 3] = Math.round(130 + f * 30);
    } else if (i < 180) {
      // 120..180: Orange to Red (High to Severe)
      const f = (i - 120) / 60.0;
      ramp[offset] = Math.round(240 + f * (217 - 240));
      ramp[offset + 1] = Math.round(138 + f * (58 - 138));
      ramp[offset + 2] = Math.round(36 + f * (43 - 36));
      ramp[offset + 3] = Math.round(160 + f * 35);
    } else {
      // 180..240: Red to Black (Severe to No Travel)
      const f = Math.min(1.0, (i - 180) / 60.0);
      ramp[offset] = Math.round(217 + f * (27 - 217));
      ramp[offset + 1] = Math.round(58 + f * (27 - 58));
      ramp[offset + 2] = Math.round(43 + f * (27 - 43));
      ramp[offset + 3] = Math.round(195 + f * 45); // Higher opacity
    }
  }
  return ramp;
}

export const COLOR_RAMP_RGBA = createColorRamp();

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}
