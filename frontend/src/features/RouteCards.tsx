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
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-saas-secondary">
          Evaluated Route Options ({plan.routes.length})
        </h3>
        <span className="text-[11px] text-saas-muted font-medium">
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
                  ? 'bg-saas-softBlue/30 border-saas-primary ring-1 ring-saas-primary shadow-saas'
                  : 'bg-white border-saas-border hover:border-slate-300 hover:shadow-saas-sm'
              } ${isBlocked ? 'border-red-200 bg-red-50/30' : ''}`}
            >
              {/* Header: Label, badge, recommended */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                    isSelected ? 'bg-saas-primary text-white' : 'bg-slate-100 text-saas-secondary'
                  }`}>
                    {route.id}
                  </span>
                  <span className="text-sm font-semibold text-saas-text">
                    {route.label}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Award className="w-3 h-3" />
                      Recommended
                    </span>
                  )}
                  {isBlocked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                      <AlertTriangle className="w-3 h-3" />
                      No Travel Block
                    </span>
                  )}
                </div>
              </div>

              {/* Core numbers: Distance, Duration, Avg Risk */}
              <div className="grid grid-cols-3 gap-2 py-2 border-y border-saas-border/70 mb-2.5 text-xs">
                <div>
                  <div className="text-[10px] text-saas-muted uppercase font-medium">Distance</div>
                  <div className="font-semibold font-mono text-saas-text">
                    {route.distance_mi.toFixed(1)} mi
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-saas-muted uppercase font-medium">Est. Duration</div>
                  <div className="font-semibold font-mono text-saas-text flex items-center gap-1">
                    <Clock className="w-3 h-3 text-saas-secondary" />
                    {formatDuration(route.duration_s)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-saas-muted uppercase font-medium">Avg Risk</div>
                  <div className="font-semibold font-mono text-saas-text">
                    {route.metrics.avg_risk.toFixed(2)}{' '}
                    <span className="text-[10px] text-saas-muted font-normal">/ 4.0</span>
                  </div>
                </div>
              </div>

              {/* Risk Mile Breakdown Chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {route.metrics.severe_mi > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-red-50 text-red-700 border border-red-200 font-medium">
                    {route.metrics.severe_mi.toFixed(1)} mi Severe
                  </span>
                )}
                {route.metrics.high_mi > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-orange-50 text-orange-700 border border-orange-200 font-medium">
                    {route.metrics.high_mi.toFixed(1)} mi High
                  </span>
                )}
                {route.metrics.moderate_mi > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                    {route.metrics.moderate_mi.toFixed(1)} mi Mod
                  </span>
                )}
                {route.metrics.severe_mi === 0 && route.metrics.high_mi === 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" /> 0 Severe/High mi
                  </span>
                )}
              </div>

              {/* Comparison Delta vs Recommended Route */}
              {!isRecommended && (
                <div className="flex items-center gap-2 text-[11px] text-saas-secondary border-t border-saas-border/70 pt-2 font-medium">
                  <span className="text-[10px] text-saas-muted">vs Winner:</span>
                  {timeDeltaMin !== 0 && (
                    <span className={timeDeltaMin > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                      {timeDeltaMin > 0 ? `+${timeDeltaMin} min` : `${timeDeltaMin} min`}
                    </span>
                  )}
                  {severeDelta !== 0 && (
                    <span className={severeDelta > 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {severeDelta > 0 ? `+${severeDelta.toFixed(1)} Severe mi` : `${severeDelta.toFixed(1)} Severe mi`}
                    </span>
                  )}
                  {highDelta !== 0 && severeDelta === 0 && (
                    <span className={highDelta > 0 ? 'text-orange-700' : 'text-emerald-700'}>
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
