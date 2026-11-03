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
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">
            Route {selectedRoute.id} Corridor Risk Ribbon
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            ({totalMi.toFixed(0)} mi)
          </span>
        </div>

        {hoveredCheckpoint ? (
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
            <span className="text-blue-400">Mile {hoveredCheckpoint.dist_mi.toFixed(0)}:</span>
            <span>{hoveredCheckpoint.weather.wind_mph} mph wind</span>
            {hoveredCheckpoint.weather.rain_in_hr > 0 && (
              <span className="text-cyan-400">| {hoveredCheckpoint.weather.rain_in_hr} in/hr rain</span>
            )}
            {hoveredCheckpoint.weather.snow_in_hr > 0 && (
              <span className="text-blue-200">| {hoveredCheckpoint.weather.snow_in_hr} in/hr snow</span>
            )}
            <span
              className="px-1.5 py-0.2 rounded font-semibold text-[10px]"
              style={{
                backgroundColor: RISK_COLORS[hoveredCheckpoint.risk.overall],
                color: hoveredCheckpoint.risk.overall === 'MODERATE' ? '#000' : '#fff',
              }}
            >
              {hoveredCheckpoint.risk.overall}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-500 font-mono">
            Hover checkpoints to inspect segment weather
          </span>
        )}
      </div>

      {/* Ribbon Bar (Segments proportional to owned miles) */}
      <div className="relative h-6 w-full rounded-md overflow-hidden flex bg-slate-950 border border-slate-800">
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
              className={`h-full transition-opacity cursor-pointer relative ${
                isHovered ? 'ring-2 ring-white z-10 brightness-125' : 'hover:opacity-90'
              }`}
              title={`Mile ${cp.dist_mi}: ${cp.risk.overall} (Wind: ${cp.weather.wind_mph}mph, Rain: ${cp.weather.rain_in_hr}in, Snow: ${cp.weather.snow_in_hr}in)`}
            />
          );
        })}
      </div>

      {/* Axis Mileage Ticks */}
      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-1 px-1">
        <span>0 mi (Origin)</span>
        <span>{(totalMi * 0.25).toFixed(0)} mi</span>
        <span>{(totalMi * 0.5).toFixed(0)} mi</span>
        <span>{(totalMi * 0.75).toFixed(0)} mi</span>
        <span>{totalMi.toFixed(0)} mi (Destination)</span>
      </div>
    </div>
  );
};
