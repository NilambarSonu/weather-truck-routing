import React from 'react';
import { TripForm } from './features/TripForm';
import { RecommendationBanner } from './features/RecommendationBanner';
import { RouteCards } from './features/RouteCards';
import { RiskRibbon } from './features/RiskRibbon';
import { HeatmapControls } from './features/HeatmapControls';
import { MapView } from './map/MapView';
import { useTripStore } from './state/useTripStore';
import { Truck, Activity } from 'lucide-react';

export const App: React.FC = () => {
  const { plan } = useTripStore();

  const serverTiming = plan?.meta?.server_timing;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">SPOTTER</span>
              <span className="text-slate-600">|</span>
              <span className="font-medium text-xs text-slate-300">Weather-Aware Truck Routing</span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block">
              ETA-Aligned Corridor Weather Forecasting & Gross Weight Risk Engine
            </p>
          </div>
        </div>

        {/* Live Status & Observability Pills */}
        <div className="flex items-center gap-3">
          {serverTiming && (
            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-400">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>Routing: {serverTiming.routing_ms.toFixed(0)}ms</span>
              <span className="text-slate-700">&bull;</span>
              <span>Weather: {serverTiming.weather_ms.toFixed(0)}ms</span>
              <span className="text-slate-700">&bull;</span>
              <span className="text-slate-200">Total: {serverTiming.total_ms.toFixed(0)}ms</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Keyless Demo / Live Ready</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar Panel */}
        <div className="w-full md:w-[420px] lg:w-[460px] h-full border-r border-slate-800 bg-slate-950/95 overflow-y-auto p-4 space-y-4 flex-shrink-0 z-20 shadow-2xl">
          <TripForm />

          {plan && (
            <div className="space-y-4 pt-2 border-t border-slate-800/80">
              <RecommendationBanner />
              <RouteCards />
            </div>
          )}
        </div>

        {/* Right Map & Overlays Panel */}
        <div className="flex-1 h-full relative overflow-hidden bg-slate-900">
          <MapView />

          {/* Floating Bottom Dock (Risk Ribbon + 0-48h Heatmap Slider) */}
          {plan && (
            <div className="absolute bottom-4 left-6 right-6 z-20 space-y-2 pointer-events-none max-w-4xl mx-auto">
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
