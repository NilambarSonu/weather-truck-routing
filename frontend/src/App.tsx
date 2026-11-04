import React from 'react';
import { TripForm } from './features/TripForm';
import { RecommendationBanner } from './features/RecommendationBanner';
import { RouteCards } from './features/RouteCards';
import { RiskRibbon } from './features/RiskRibbon';
import { HeatmapControls } from './features/HeatmapControls';
import { MapView } from './map/MapView';
import { useTripStore } from './state/useTripStore';
import { Truck, Activity, ExternalLink } from 'lucide-react';

export const App: React.FC = () => {
  const { plan } = useTripStore();

  const serverTiming = plan?.meta?.server_timing;

  return (
    <div className="flex flex-col h-screen w-screen bg-saas-bg text-saas-text overflow-hidden font-sans">
      {/* Top Header */}
      <header className="h-[60px] border-b border-saas-border bg-white/95 backdrop-blur px-5 flex items-center justify-between z-30 flex-shrink-0 shadow-saas-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-saas-softBlue border border-blue-100 flex items-center justify-center text-saas-primary shadow-sm">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-saas-text">SPOTTER</span>
              <span className="text-saas-border">/</span>
              <span className="font-medium text-xs text-saas-secondary">Weather-Aware Truck Routing</span>
            </div>
            <p className="text-[11px] text-saas-muted hidden sm:block">
              ETA-Aligned Corridor Weather Forecasts & Gross Weight Escalation Engine
            </p>
          </div>
        </div>

        {/* Live Status & Observability Pills */}
        <div className="flex items-center gap-2.5">
          {serverTiming && (
            <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono bg-saas-subtle px-3 py-1 rounded-lg border border-saas-border text-saas-secondary">
              <Activity className="w-3.5 h-3.5 text-saas-primary" />
              <span>Routing: {serverTiming.routing_ms.toFixed(0)}ms</span>
              <span className="text-saas-border">&bull;</span>
              <span>Wx: {serverTiming.weather_ms.toFixed(0)}ms</span>
              <span className="text-saas-border">&bull;</span>
              <span className="font-semibold text-saas-text">Total: {serverTiming.total_ms.toFixed(0)}ms</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="hidden sm:inline">Commercial API Active:</span>
            <span className="font-semibold">TomTom + Open-Meteo</span>
          </div>

          <a
            href="/api/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1 text-xs text-saas-secondary hover:text-saas-primary px-2.5 py-1 rounded-lg hover:bg-saas-subtle border border-transparent hover:border-saas-border transition"
            title="Open OpenAPI / Swagger Documentation"
          >
            <span>API Docs</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar Panel */}
        <div className="w-full md:w-[420px] lg:w-[450px] h-full border-r border-saas-border bg-white overflow-y-auto p-4 space-y-4 flex-shrink-0 z-20 shadow-saas">
          <TripForm />

          {plan && (
            <div className="space-y-4 pt-3 border-t border-saas-border">
              {plan.meta?.warnings?.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Operational Advisory:
                  </div>
                  {plan.meta.warnings.map((w, idx) => (
                    <p key={idx} className="text-[11px] text-amber-800/90 leading-relaxed">
                      {w}
                    </p>
                  ))}
                </div>
              )}
              <RecommendationBanner />
              <RouteCards />
            </div>
          )}
        </div>

        {/* Right Map & Floating Controls Area */}
        <div className="flex-1 h-full relative overflow-hidden bg-saas-subtle">
          <MapView />

          {/* Floating Bottom Dock (Risk Ribbon + 49h Heatmap Timeline) */}
          {plan && (
            <div className="absolute bottom-5 left-6 right-6 z-20 space-y-2.5 pointer-events-none max-w-4xl mx-auto">
              <div className="pointer-events-auto">
                <RiskRibbon />
              </div>
              <div className="pointer-events-auto">
                <HeatmapControls />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
