import React from 'react';
import { useTripStore } from '../state/useTripStore';
import { RISK_COLORS } from '../lib/colors';
import { Shield } from 'lucide-react';

export const RiskRibbon: React.FC = () => {
  const { plan, selectedRouteId, hoveredCheckpoint, setHoveredCheckpoint } = useTripStore();

  if (!plan) return null;

  const selectedRoute = plan.routes.find((r) => r.id === selectedRouteId) || plan.routes[0];
  if (!selectedRoute || !selectedRoute.checkpoints.length) return null;

  const totalMi = selectedRoute.distance_mi;
  const checkpoints = selectedRoute.checkpoints;

  return (
    <div className="bg-white/95 backdrop-blur border border-saas-border rounded-2xl p-3.5 shadow-saas-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-saas-primary" />
          <span className="text-xs font-semibold text-saas-text">
            Route {selectedRoute.id} Corridor Weather Risk Ribbon
          </span>
          <span className="text-[11px] text-saas-muted font-mono font-medium">
            ({totalMi.toFixed(0)} mi)
          </span>
        </div>

        {hoveredCheckpoint ? (
          <div className="flex items-center gap-2 text-xs font-mono bg-saas-subtle px-2.5 py-1 rounded-lg border border-saas-border text-saas-text shadow-saas-sm">
            <span className="text-saas-primary font-bold">Mile {hoveredCheckpoint.dist_mi.toFixed(0)}:</span>
            <span>{hoveredCheckpoint.weather.wind_mph.toFixed(0)} mph wind</span>
            {hoveredCheckpoint.weather.rain_in_hr > 0 && (
              <span className="text-blue-600 font-medium">| {hoveredCheckpoint.weather.rain_in_hr.toFixed(2)} in/hr rain</span>
            )}
            {hoveredCheckpoint.weather.snow_in_hr > 0 && (
              <span className="text-indigo-600 font-medium">| {hoveredCheckpoint.weather.snow_in_hr.toFixed(2)} in/hr snow</span>
            )}
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
              style={{ backgroundColor: RISK_COLORS[hoveredCheckpoint.risk.overall] }}
            >
              {hoveredCheckpoint.risk.overall}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-saas-muted font-medium">
            Hover checkpoints to inspect segment hazards
          </span>
        )}
      </div>

      {/* Ribbon Bar (Segments proportional to owned miles) */}
      <div className="relative h-6 w-full rounded-lg overflow-hidden flex bg-slate-100 border border-saas-border shadow-inner">
        {checkpoints.map((cp) => {
          const widthPct = (cp.owned_mi / totalMi) * 100;
          const isHovered = hoveredCheckpoint?.index === cp.index;
          return (
            <div
              key={cp.index}
              onMouseEnter={() => setHoveredCheckpoint(cp)}
              onMouseLeave={() => setHoveredCheckpoint(null)}
              style={{
                width: `${widthPct}%`,
                backgroundColor: RISK_COLORS[cp.risk.overall],
              }}
              className={`h-full transition-all cursor-pointer relative ${
                isHovered ? 'ring-2 ring-saas-primary z-10 brightness-110 scale-y-110' : 'hover:opacity-90'
              }`}
              title={`Mile ${cp.dist_mi}: ${cp.risk.overall} (Wind: ${cp.weather.wind_mph}mph, Rain: ${cp.weather.rain_in_hr}in, Snow: ${cp.weather.snow_in_hr}in)`}
            />
          );
        })}
      </div>

      {/* Axis Mileage Ticks */}
      <div className="flex justify-between items-center text-[10px] font-mono text-saas-muted mt-1.5 px-0.5 font-medium">
        <span>0 mi (Origin)</span>
        <span>{(totalMi * 0.25).toFixed(0)} mi</span>
        <span>{(totalMi * 0.5).toFixed(0)} mi</span>
        <span>{(totalMi * 0.75).toFixed(0)} mi</span>
        <span>{totalMi.toFixed(0)} mi (Destination)</span>
      </div>
    </div>
  );
};
