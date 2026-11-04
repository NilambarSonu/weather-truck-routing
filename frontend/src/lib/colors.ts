import { RiskLevel } from '../api/types';

export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: '#2E9E5B',
  MODERATE: '#D97706',
  HIGH: '#EA580C',
  SEVERE: '#DC2626',
  NO_TRAVEL: '#991B1B',
};

export const RISK_BG_CLASSES: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  MODERATE: 'bg-amber-50 text-amber-900 border-amber-200',
  HIGH: 'bg-orange-50 text-orange-900 border-orange-200',
  SEVERE: 'bg-red-50 text-red-900 border-red-200',
  NO_TRAVEL: 'bg-red-100 text-red-950 border-red-300',
};

export const RISK_BADGE_SOLID: Record<RiskLevel, string> = {
  LOW: 'bg-[#2E9E5B] text-white',
  MODERATE: 'bg-[#D97706] text-white',
  HIGH: 'bg-[#EA580C] text-white',
  SEVERE: 'bg-[#DC2626] text-white',
  NO_TRAVEL: 'bg-[#991B1B] text-white',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low (Safe)',
  MODERATE: 'Moderate',
  HIGH: 'High Risk',
  SEVERE: 'Severe Risk',
  NO_TRAVEL: 'No Travel',
};

// 256-entry RGBA color ramp for deck.gl H3HexagonLayer
// Precomputed for instant, zero-allocation lookup per cell per frame
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
      // 0..60: Soft Green to Amber (Low to Moderate)
      const f = i / 60.0;
      ramp[offset] = Math.round(46 + f * (217 - 46));
      ramp[offset + 1] = Math.round(158 + f * (119 - 158));
      ramp[offset + 2] = Math.round(91 + f * (6 - 91));
      ramp[offset + 3] = Math.round(75 + f * 25); // Subtle opacity ~30-40%
    } else if (i < 120) {
      // 60..120: Amber to Coral (Moderate to High)
      const f = (i - 60) / 60.0;
      ramp[offset] = Math.round(217 + f * (234 - 217));
      ramp[offset + 1] = Math.round(119 + f * (88 - 119));
      ramp[offset + 2] = Math.round(6 + f * (12 - 6));
      ramp[offset + 3] = Math.round(100 + f * 25);
    } else if (i < 180) {
      // 120..180: Coral to Red (High to Severe)
      const f = (i - 120) / 60.0;
      ramp[offset] = Math.round(234 + f * (220 - 234));
      ramp[offset + 1] = Math.round(88 + f * (38 - 88));
      ramp[offset + 2] = Math.round(12 + f * (38 - 12));
      ramp[offset + 3] = Math.round(125 + f * 25);
    } else {
      // 180..240: Red to Deep Crimson (Severe to No Travel)
      const f = Math.min(1.0, (i - 180) / 60.0);
      ramp[offset] = Math.round(220 + f * (153 - 220));
      ramp[offset + 1] = Math.round(38 + f * (27 - 38));
      ramp[offset + 2] = Math.round(38 + f * (27 - 38));
      ramp[offset + 3] = Math.round(150 + f * 30);
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
