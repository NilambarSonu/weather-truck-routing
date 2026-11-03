import React, { useState } from 'react';
import { useTripStore } from '../state/useTripStore';
import { Award, AlertTriangle, ChevronDown, ChevronUp, CheckCircle, Info } from 'lucide-react';

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
          ? 'bg-red-950/40 border-red-700/60 text-red-200'
          : 'bg-emerald-950/30 border-emerald-600/40 text-emerald-200 shadow-lg shadow-emerald-950/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isBlocked ? 'bg-red-900/60 text-red-300' : 'bg-emerald-600/30 text-emerald-300'
          }`}
        >
          {isBlocked ? <AlertTriangle className="w-5 h-5" /> : <Award className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-bold tracking-wider opacity-80">
              {isBlocked ? 'Travel Advisory' : 'Official Route Recommendation'}
            </span>
            {winner && (
              <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Route {winner.id}
              </span>
            )}
          </div>

          <p className="text-sm font-medium text-slate-100 leading-snug mb-2">
            {recommendation.summary}
          </p>

          {/* Reason Chips */}
          <div className="flex flex-wrap gap-1.5 mb-1">
            {recommendation.reasons.map((reason, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-300"
              >
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                Tier: {reason.tier} (Kept: {reason.kept.join(', ')})
              </span>
            ))}
          </div>

          {/* Expandable Algorithmic Explanation */}
          <button
            type="button"
            onClick={() => setShowDetail(!showDetail)}
            className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 mt-1 transition"
          >
            <span>Algorithm Decision Details</span>
            {showDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showDetail && (
            <div className="mt-2.5 p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-1.5 text-slate-300 font-sans">
              <div className="font-semibold text-slate-200 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                Tolerance-Banded Lexicographic Hierarchy:
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                <li>
                  <strong className="text-slate-300">Fewest Severe Miles:</strong> Hard-filtered against the minimum + tolerance band.
                </li>
                <li>
                  <strong className="text-slate-300">Fewest High Miles:</strong> Evaluated across surviving candidates.
                </li>
                <li>
                  <strong className="text-slate-300">Lowest Average Risk:</strong> Mile-weighted continuous intensity score.
                </li>
                <li>
                  <strong className="text-slate-300">Shortest Driving Time:</strong> Breaks remaining ties.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
