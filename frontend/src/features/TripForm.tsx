import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Place, TripPlanRequest } from '../api/types';
import { geocodePlaces, createTripPlan, getHeatmap } from '../api/client';
import { useTripStore } from '../state/useTripStore';
import { MapPin, Calendar, Weight, Sliders, ChevronDown, ChevronUp, Navigation, AlertCircle } from 'lucide-react';

interface FormValues {
  departure_local: string;
  load_lb: number;
  sampling_mode: 'auto' | 'fixed';
  interval_mi: number;
  ranking_mode: 'tolerant' | 'strict';
}

const PRESET_CORRIDORS = [
  {
    name: 'Chicago → Denver',
    origin: { label: 'Chicago, IL, USA', lat: 41.8781, lon: -87.6298 },
    destination: { label: 'Denver, CO, USA', lat: 39.7392, lon: -104.9903 },
  },
  {
    name: 'Los Angeles → Dallas',
    origin: { label: 'Los Angeles, CA, USA', lat: 34.0522, lon: -118.2437 },
    destination: { label: 'Dallas, TX, USA', lat: 32.7767, lon: -96.7970 },
  },
  {
    name: 'New York → Atlanta',
    origin: { label: 'New York, NY, USA', lat: 40.7128, lon: -74.0060 },
    destination: { label: 'Atlanta, GA, USA', lat: 33.7490, lon: -84.3880 },
  },
];

export const TripForm: React.FC = () => {
  const { setPlan, setHeatmapPayload, setIsHeatmapLoading } = useTripStore();

  const [origin, setOrigin] = useState<Place>(PRESET_CORRIDORS[0].origin);
  const [destination, setDestination] = useState<Place>(PRESET_CORRIDORS[0].destination);

  const [originQuery, setOriginQuery] = useState(PRESET_CORRIDORS[0].origin.label);
  const [destQuery, setDestQuery] = useState(PRESET_CORRIDORS[0].destination.label);

  const [originSuggestions, setOriginSuggestions] = useState<Place[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Place[]>([]);

  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Default departure: tomorrow 08:00 AM local
  const getDefaultDeparture = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  };

  const { register, handleSubmit, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      departure_local: getDefaultDeparture(),
      load_lb: 42000,
      sampling_mode: 'auto',
      interval_mi: 25,
      ranking_mode: 'tolerant',
    },
  });

  const watchLoad = watch('load_lb');
  const watchSampling = watch('sampling_mode');

  // Debounced geocoding search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (originQuery && originQuery !== origin?.label) {
        try {
          const results = await geocodePlaces(originQuery);
          setOriginSuggestions(results);
          setShowOriginDropdown(true);
        } catch {}
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [originQuery, origin]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (destQuery && destQuery !== destination?.label) {
        try {
          const results = await geocodePlaces(destQuery);
          setDestSuggestions(results);
          setShowDestDropdown(true);
        } catch {}
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [destQuery, destination]);

  const selectPreset = (preset: typeof PRESET_CORRIDORS[0]) => {
    setOrigin(preset.origin);
    setOriginQuery(preset.origin.label);
    setDestination(preset.destination);
    setDestQuery(preset.destination.label);
    setShowOriginDropdown(false);
    setShowDestDropdown(false);
  };

  const onSubmit = async (values: FormValues) => {
    if (!origin || !destination) {
      setErrorMsg('Please select valid origin and destination locations.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const payload: TripPlanRequest = {
      origin,
      destination,
      departure_local: values.departure_local,
      load_lb: Number(values.load_lb),
      sampling: {
        mode: values.sampling_mode,
        interval_mi: Number(values.interval_mi),
      },
      options: {
        ranking: values.ranking_mode,
      },
    };

    try {
      // 1. Create plan (Stages 1-10)
      const plan = await createTripPlan(payload);
      setPlan(plan);

      // 2. Fetch heatmap lazily in background (Stage 11)
      setIsHeatmapLoading(true);
      getHeatmap(plan.id)
        .then((hm) => setHeatmapPayload(hm))
        .catch((err) => console.warn('Heatmap load warning:', err));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate weather routing plan.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Preset Corridor Shortcuts */}
      <div>
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Freight Corridors</span>
          <span className="text-[10px] text-emerald-400 font-mono">Instant Presets</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_CORRIDORS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => selectPreset(preset)}
              className={`px-2 py-1.5 text-xs rounded-md border font-medium text-left truncate transition-colors ${
                origin?.label === preset.origin.label
                  ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Origin & Destination Pickers */}
      <div className="space-y-2">
        {/* Origin */}
        <div className="relative">
          <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"></span>
            Origin (Pickup)
          </label>
          <div className="relative">
            <input
              type="text"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
              onFocus={() => originSuggestions.length > 0 && setShowOriginDropdown(true)}
              placeholder="Search origin city or terminal..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <MapPin className="w-4 h-4 text-emerald-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>

          {showOriginDropdown && originSuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {originSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setOrigin(item);
                    setOriginQuery(item.label);
                    setShowOriginDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 text-slate-200 border-b border-slate-800/60 last:border-0 truncate"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="relative">
          <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/20"></span>
            Destination (Dropoff)
          </label>
          <div className="relative">
            <input
              type="text"
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              onFocus={() => destSuggestions.length > 0 && setShowDestDropdown(true)}
              placeholder="Search destination city..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <MapPin className="w-4 h-4 text-red-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>

          {showDestDropdown && destSuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {destSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setDestination(item);
                    setDestQuery(item.label);
                    setShowDestDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 text-slate-200 border-b border-slate-800/60 last:border-0 truncate"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Departure Date/Time & Quick Presets */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          Departure Date & Time (Origin Local)
        </label>
        <input
          type="datetime-local"
          {...register('departure_local', { required: true })}
          className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
        <div className="flex gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setValue('departure_local', now.toISOString().slice(0, 16));
            }}
            className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-800 transition"
          >
            Depart Now
          </button>
          <button
            type="button"
            onClick={() => {
              const in2h = new Date(Date.now() + 2 * 3600 * 1000);
              setValue('departure_local', in2h.toISOString().slice(0, 16));
            }}
            className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-800 transition"
          >
            +2 Hours
          </button>
          <button
            type="button"
            onClick={() => setValue('departure_local', getDefaultDeparture())}
            className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-800 transition"
          >
            Tomorrow 8 AM
          </button>
        </div>
      </div>

      {/* Load Weight in pounds */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Weight className="w-3.5 h-3.5 text-amber-400" />
            Truck Cargo Weight (lb)
          </label>
          <span className="text-xs font-mono font-semibold text-slate-200">
            {Number(watchLoad || 0).toLocaleString()} lb
          </span>
        </div>

        <input
          type="number"
          min="1"
          max="80000"
          step="500"
          {...register('load_lb', { required: true, min: 1, max: 80000 })}
          className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />

        {/* Quick weight selector chips */}
        <div className="flex gap-1.5 mt-1.5">
          {[20000, 32000, 42000, 65000].map((wt) => (
            <button
              key={wt}
              type="button"
              onClick={() => setValue('load_lb', wt)}
              className={`text-[11px] px-2 py-0.5 rounded border transition font-mono ${
                watchLoad === wt
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              {(wt / 1000).toFixed(0)}k lb
            </button>
          ))}
        </div>

        {/* Load Rule dynamic status banner */}
        <div className="mt-2 text-[11px] p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-400 leading-relaxed">
          <span className="font-semibold text-slate-300">Active Load Rules:</span>{' '}
          {watchLoad > 40000 ? (
            <span className="text-orange-400 font-medium">
              &gt;40,000 lb: Wind 35-44 mph escalates to <strong>Severe</strong>. Wind 45-54 mph is <strong>No Travel</strong>.
            </span>
          ) : watchLoad > 30000 ? (
            <span className="text-amber-400 font-medium">
              &gt;30,000 lb: Wind 45-54 mph escalates to <strong>No Travel</strong>.
            </span>
          ) : (
            <span className="text-emerald-400 font-medium">
              &le;30,000 lb: Standard baseline thresholds apply.
            </span>
          )}
        </div>
      </div>

      {/* Advanced Options Accordion */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 text-xs font-medium text-slate-400 hover:text-slate-200 transition"
        >
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3 h-3" />
            Sampling & Algorithm Controls
          </span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAdvanced && (
          <div className="p-3 bg-slate-950 space-y-3 text-xs border-t border-slate-800">
            {/* Sampling Policy */}
            <div>
              <label className="block text-slate-400 mb-1">Checkpoint Sampling Interval</label>
              <select
                {...register('sampling_mode')}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
              >
                <option value="auto">Auto (10 mi for &le;250mi, 25 mi for &le;800mi, 50 mi for &gt;800mi)</option>
                <option value="fixed">Fixed Interval</option>
              </select>
            </div>

            {watchSampling === 'fixed' && (
              <div>
                <label className="block text-slate-400 mb-1">Fixed Mileage Interval</label>
                <select
                  {...register('interval_mi')}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
                >
                  <option value={10}>Every 10 Miles</option>
                  <option value={25}>Every 25 Miles</option>
                  <option value={50}>Every 50 Miles</option>
                </select>
              </div>
            )}

            {/* Ranking Mode */}
            <div>
              <label className="block text-slate-400 mb-1">Recommendation Hierarchy</label>
              <select
                {...register('ranking_mode')}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
              >
                <option value="tolerant">Tolerance-Banded (Prevents 0.3 mi difference beating 3h)</option>
                <option value="strict">Strict Lexicographic (Zero tolerance)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-2.5 bg-red-950/60 border border-red-500/50 rounded-lg flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition cursor-pointer"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Evaluating Weather Along Routes...</span>
          </>
        ) : (
          <>
            <Navigation className="w-4 h-4" />
            <span>Generate Weather-Aware Routes</span>
          </>
        )}
      </button>
    </form>
  );
};
