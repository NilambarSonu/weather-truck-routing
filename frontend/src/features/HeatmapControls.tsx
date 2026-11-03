import React, { useEffect, useRef } from 'react';
import { useTripStore, WeatherLayerMode } from '../state/useTripStore';
import { Play, Pause, RotateCcw, Wind, CloudRain, Snowflake, Flame } from 'lucide-react';
import { formatDateTime } from '../lib/colors';

export const HeatmapControls: React.FC = () => {
  const {
    plan,
    heatmapHour,
    setHeatmapHour,
    isPlaying,
    setIsPlaying,
    activeLayer,
    setActiveLayer,
    showHeatmap,
    setShowHeatmap,
    isHeatmapLoading,
  } = useTripStore();

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Smooth animation playback at ~3 hours per second
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      lastTimeRef.current = null;
      return;
    }

    const speedHoursPerSec = 3.0;

    const tick = (now: number) => {
      if (lastTimeRef.current !== null) {
        const deltaSec = (now - lastTimeRef.current) / 1000.0;
        const nextHour = heatmapHour + deltaSec * speedHoursPerSec;
        if (nextHour >= 48.0) {
          setHeatmapHour(48.0);
          setIsPlaying(false);
          return;
        }
        setHeatmapHour(nextHour);
      }
      lastTimeRef.current = now;
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, heatmapHour, setHeatmapHour, setIsPlaying]);

  if (!plan) return null;

  // Calculate absolute forecast timestamp for current slider position
  const t0Str = plan.request.departure_utc;
  const t0 = new Date(t0Str).getTime();
  const currentForecastTime = new Date(t0 + heatmapHour * 3600 * 1000).toISOString();

  const layers: { id: WeatherLayerMode; label: string; icon: any }[] = [
    { id: 'overall', label: 'Overall Risk', icon: Flame },
    { id: 'wind', label: 'Wind Speed', icon: Wind },
    { id: 'rain', label: 'Precipitation', icon: CloudRain },
    { id: 'snow', label: 'Snowfall', icon: Snowflake },
  ];

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-xl space-y-3">
      {/* Top bar: Controls, Time Display, Layer switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition shadow-md shadow-blue-600/30 cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play 48h Weather Forecast Animation'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Reset to Hour 0 */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setHeatmapHour(0);
            }}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition border border-slate-700"
            title="Reset to Departure Hour (0h)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Time Display */}
          <div className="px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-400">
              +{heatmapHour.toFixed(1)}h
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-xs font-mono text-slate-200">
              {formatDateTime(currentForecastTime)}
            </span>
          </div>

          {isHeatmapLoading && (
            <span className="text-[11px] text-amber-400 font-mono flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Loading 49h Corridor Hexagons...
            </span>
          )}
        </div>

        {/* Layer Selector & Toggle */}
        <div className="flex items-center gap-1.5">
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {layers.map((lyr) => {
              const Icon = lyr.icon;
              const isActive = activeLayer === lyr.id;
              return (
                <button
                  key={lyr.id}
                  type="button"
                  onClick={() => setActiveLayer(lyr.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{lyr.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              showHeatmap
                ? 'bg-slate-800 text-blue-400 border-blue-500/40'
                : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
          >
            Heatmap: {showHeatmap ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Time Slider */}
      <div className="space-y-1">
        <input
          type="range"
          min="0"
          max="48"
          step="0.1"
          value={heatmapHour}
          onChange={(e) => {
            setIsPlaying(false);
            setHeatmapHour(parseFloat(e.target.value));
          }}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>0h (Departure)</span>
          <span>12h</span>
          <span>24h (Day 1)</span>
          <span>36h</span>
          <span>48h (Day 2)</span>
        </div>
      </div>
    </div>
  );
};
