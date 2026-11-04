import React, { useEffect, useRef } from 'react';
import { useTripStore, WeatherLayerMode } from '../state/useTripStore';
import { Play, Pause, RotateCcw, Wind, CloudRain, Snowflake, ShieldAlert } from 'lucide-react';
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
  const originTz = plan.request.origin_tz;

  const layers: { id: WeatherLayerMode; label: string; icon: any }[] = [
    { id: 'overall', label: 'Overall Risk', icon: ShieldAlert },
    { id: 'wind', label: 'Wind Speed', icon: Wind },
    { id: 'rain', label: 'Precipitation', icon: CloudRain },
    { id: 'snow', label: 'Snowfall', icon: Snowflake },
  ];

  return (
    <div className="bg-white/95 backdrop-blur border border-saas-border rounded-2xl p-3.5 shadow-saas-md space-y-3">
      {/* Top bar: Controls, Time Display, Layer switch */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-8 h-8 rounded-lg bg-saas-primary hover:bg-saas-primaryHover text-white flex items-center justify-center transition shadow-saas-sm cursor-pointer"
            title={isPlaying ? 'Pause 48h Weather Forecast Animation' : 'Play 48h Weather Forecast Animation'}
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
            className="w-8 h-8 rounded-lg bg-saas-subtle hover:bg-slate-100 text-saas-secondary hover:text-saas-text flex items-center justify-center transition border border-saas-border shadow-saas-sm cursor-pointer"
            title="Reset to Departure Hour (0h)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Time Display */}
          <div className="px-3 py-1 bg-saas-softBlue/60 rounded-lg border border-blue-100 flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-saas-primary">
              +{heatmapHour.toFixed(1)}h
            </span>
            <span className="text-blue-200">|</span>
            <span className="text-xs font-mono font-medium text-saas-text" title={`Forecast time in Origin timezone (${originTz})`}>
              {formatDateTime(currentForecastTime, originTz)}
            </span>
          </div>

          {isHeatmapLoading && (
            <span className="text-[11px] text-amber-700 font-mono font-medium flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Generating 49h Hexagons...
            </span>
          )}
        </div>

        {/* Layer Selector & Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-saas-border/70">
            {layers.map((lyr) => {
              const Icon = lyr.icon;
              const isActive = activeLayer === lyr.id;
              return (
                <button
                  key={lyr.id}
                  type="button"
                  onClick={() => setActiveLayer(lyr.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    isActive
                      ? 'bg-white text-saas-primary shadow-saas-sm font-semibold'
                      : 'text-saas-secondary hover:text-saas-text hover:bg-white/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{lyr.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`px-3 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-saas-sm ${
              showHeatmap
                ? 'bg-saas-softBlue text-saas-primary border-saas-primary/40'
                : 'bg-white text-saas-muted border-saas-border hover:text-saas-secondary'
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
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-saas-primary focus:outline-none"
        />
        <div className="flex justify-between text-[10px] font-mono text-saas-muted font-medium">
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
