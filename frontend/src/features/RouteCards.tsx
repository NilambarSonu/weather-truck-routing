import React from 'react';
import { useTripStore } from '../state/useTripStore';
import { formatDuration } from '../lib/colors';
import { Award, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

export const RouteCards: React.FC = () => {
  const { plan, selectedRouteId, setSelectedRouteId } = useTripStore();

  if (!plan || !plan.routes.length) return null;

  const winnerId = plan.recommendation.winner_route_id;
  const recommendedRoute = plan.routes.find((r) => r.id === winnerId) || plan.routes[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Evaluated Route Options ({plan.routes.length})
        </h3>
        <span className="text-[11px] text-slate-500 font-mono">
          Click route to inspect
        </span>
      </div>

      <div className="space-y-2.5">
        {plan.routes.map((route) => {
          const isSelected = selectedRouteId === route.id;
          const isRecommended = winnerId === route.id;
          const isBlocked = route.metrics.no_travel_mi > 0;

          // Compute delta vs recommended route
          const timeDeltaMin = Math.round((route.duration_s - recommendedRoute.duration_s) / 60);
          const severeDelta = route.metrics.severe_mi - recommendedRoute.metrics.severe_mi;
          const highDelta = route.metrics.high_mi - recommendedRoute.metrics.high_mi;

          return (
            <div
              key={route.id}
              onClick={() => setSelectedRouteId(route.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-slate-900 border-blue-500 ring-1 ring-blue-500/50 shadow-lg shadow-blue-500/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              } ${isBlocked ? 'border-red-900/60 bg-red-950/20' : ''}`}
            >
              {/* Header: Label, badge, recommended */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-slate-200">
                    {route.id}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">
                    {route.label}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">
                      <Award className="w-3 h-3" />
                      Recommended
                    </span>
                  )}
                  {isBlocked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800">
                      <AlertTriangle className="w-3 h-3" />
                      No Travel Block
                    </span>
                  )}
                </div>
              </div>

              {/* Core numbers: Distance, Duration, Avg Risk */}
              <div className="grid grid-cols-3 gap-2 py-1.5 border-y border-slate-800/60 mb-2.5 text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Distance</div>
                  <div className="font-semibold font-mono text-slate-200">
                    {route.distance_mi.toFixed(1)} mi
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Est. Duration</div>
                  <div className="font-semibold font-mono text-slate-200 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDuration(route.duration_s)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Avg Risk</div>
                  <div className="font-semibold font-mono text-slate-200">
                    {route.metrics.avg_risk.toFixed(2)}{' '}
                    <span className="text-[10px] text-slate-400 font-normal">/ 4.0</span>
                  </div>
                </div>
              </div>

              {/* Risk Mile Breakdown Chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {route.metrics.severe_mi > 0 && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-red-600/20 text-red-400 border border-red-500/40">
                    {route.metrics.severe_mi.toFixed(1)} mi Severe
                  </span>
                )}
                {route.metrics.high_mi > 0 && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-orange-500/20 text-orange-400 border border-orange-500/40">
                    {route.metrics.high_mi.toFixed(1)} mi High
                  </span>
                )}
                {route.metrics.moderate_mi > 0 && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {route.metrics.moderate_mi.toFixed(1)} mi Mod
                  </span>
                )}
                {route.metrics.severe_mi === 0 && route.metrics.high_mi === 0 && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> 0 Severe/High mi
                  </span>
                )}
              </div>

              {/* Comparison Delta vs Recommended Route */}
              {!isRecommended && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400 border-t border-slate-800/40 pt-1.5">
                  <span className="text-[10px] text-slate-500">vs Winner:</span>
                  {timeDeltaMin !== 0 && (
                    <span className={timeDeltaMin > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                      {timeDeltaMin > 0 ? `+${timeDeltaMin} min` : `${timeDeltaMin} min`}
                    </span>
                  )}
                  {severeDelta !== 0 && (
                    <span className={severeDelta > 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {severeDelta > 0 ? `+${severeDelta.toFixed(1)} Severe mi` : `${severeDelta.toFixed(1)} Severe mi`}
                    </span>
                  )}
                  {highDelta !== 0 && severeDelta === 0 && (
                    <span className={highDelta > 0 ? 'text-orange-400' : 'text-emerald-400'}>
                      {highDelta > 0 ? `+${highDelta.toFixed(1)} High mi` : `${highDelta.toFixed(1)} High mi`}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
