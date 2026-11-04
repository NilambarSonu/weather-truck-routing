import React, { useState } from 'react';
import { useTripStore } from '../state/useTripStore';
import { Award, AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Info } from 'lucide-react';

export const RecommendationBanner: React.FC = () => {
  const { plan } = useTripStore();
  const [showDetail, setShowDetail] = useState(false);

  if (!plan) return null;

  const { recommendation, routes } = plan;
  const isBlocked = recommendation.blocked;
  const winner = routes.find((r) => r.id === recommendation.winner_route_id);

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isBlocked
          ? 'bg-red-50/80 border-red-200 text-red-900 shadow-saas-sm'
          : 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950 shadow-saas-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
            isBlocked ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {isBlocked ? <AlertTriangle className="w-5 h-5" /> : <Award className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] uppercase font-bold tracking-wider opacity-85">
              {isBlocked ? 'Travel Advisory — No Travel' : 'Recommended Route'}
            </span>
            {winner && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300">
                Route {winner.id}
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-saas-text leading-snug mb-2.5">
            {recommendation.summary}
          </p>

          {/* Reason Badges */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {recommendation.reasons.map((reason, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-saas-secondary shadow-saas-sm"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="font-semibold text-saas-text">Tier {reason.tier}:</span> Kept [{reason.kept.join(', ')}]
              </span>
            ))}
          </div>

          {/* Expandable Algorithmic Explanation */}
          <button
            type="button"
            onClick={() => setShowDetail(!showDetail)}
            className="text-xs text-saas-secondary hover:text-saas-primary font-medium inline-flex items-center gap-1 transition"
          >
            <span>Algorithm Decision Details</span>
            {showDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDetail && (
            <div className="mt-2.5 p-3 bg-white border border-saas-border rounded-xl text-xs space-y-1.5 text-saas-secondary shadow-saas-sm font-sans">
              <div className="font-semibold text-saas-text flex items-center gap-1.5 pb-1 border-b border-saas-border">
                <Info className="w-3.5 h-3.5 text-saas-primary" />
                <span>Tolerance-Banded Lexicographic Hierarchy:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-saas-secondary pl-0.5">
                <li>
                  <strong className="text-saas-text">Fewest Severe Risk Miles:</strong> Hard-filtered against minimum + tolerance band.
                </li>
                <li>
                  <strong className="text-saas-text">Fewest High Risk Miles:</strong> Evaluated across surviving candidate routes.
                </li>
                <li>
                  <strong className="text-saas-text">Lowest Average Continuous Risk:</strong> Mile-weighted score across full trajectory.
                </li>
                <li>
                  <strong className="text-saas-text">Shortest Driving Time:</strong> Breaks ties among equally safe options.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
