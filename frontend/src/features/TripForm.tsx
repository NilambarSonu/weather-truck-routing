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
        <label className="text-[11px] font-semibold text-saas-secondary uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Preset Freight Corridors</span>
          <span className="text-[10px] text-saas-primary font-medium">Quick Select</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_CORRIDORS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => selectPreset(preset)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium text-left truncate transition ${
                origin?.label === preset.origin.label
                  ? 'bg-saas-softBlue border-saas-primary/60 text-saas-primary shadow-saas-sm'
                  : 'bg-saas-subtle border-saas-border text-saas-secondary hover:text-saas-text hover:bg-slate-100'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Origin & Destination Pickers */}
      <div className="space-y-2.5 bg-saas-subtle p-3 rounded-xl border border-saas-border">
        {/* Origin */}
        <div className="relative">
          <label className="text-xs font-medium text-saas-secondary mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"></span>
            Origin (Pickup Location)
          </label>
          <div className="relative">
            <input
              type="text"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
              onFocus={() => originSuggestions.length > 0 && setShowOriginDropdown(true)}
              placeholder="Search origin city or terminal..."
              className="w-full bg-white border border-saas-border focus:border-saas-primary rounded-lg pl-3 pr-9 py-2 text-xs font-medium text-saas-text placeholder-saas-muted focus:outline-none focus:ring-1 focus:ring-saas-primary shadow-saas-sm"
            />
            <MapPin className="w-4 h-4 text-emerald-600 absolute right-3 top-2.5 pointer-events-none" />
          </div>

          {showOriginDropdown && originSuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-saas-border rounded-xl shadow-saas-lg max-h-48 overflow-y-auto">
              {originSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setOrigin(item);
                    setOriginQuery(item.label);
                    setShowOriginDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-saas-subtle text-saas-text border-b border-saas-border/60 last:border-0 truncate font-medium"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="relative">
          <label className="text-xs font-medium text-saas-secondary mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/20"></span>
            Destination (Dropoff Location)
          </label>
          <div className="relative">
            <input
              type="text"
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              onFocus={() => destSuggestions.length > 0 && setShowDestDropdown(true)}
              placeholder="Search destination city..."
              className="w-full bg-white border border-saas-border focus:border-saas-primary rounded-lg pl-3 pr-9 py-2 text-xs font-medium text-saas-text placeholder-saas-muted focus:outline-none focus:ring-1 focus:ring-saas-primary shadow-saas-sm"
            />
            <MapPin className="w-4 h-4 text-red-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>

          {showDestDropdown && destSuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-saas-border rounded-xl shadow-saas-lg max-h-48 overflow-y-auto">
              {destSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setDestination(item);
                    setDestQuery(item.label);
                    setShowDestDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-saas-subtle text-saas-text border-b border-saas-border/60 last:border-0 truncate font-medium"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Departure Date/Time & Quick Presets */}
      <div className="bg-saas-subtle p-3 rounded-xl border border-saas-border">
        <label className="text-xs font-medium text-saas-secondary mb-1.5 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-saas-primary" />
          Departure Date & Time (Origin Local)
        </label>
        <input
          type="datetime-local"
          {...register('departure_local', { required: true })}
          className="w-full bg-white border border-saas-border focus:border-saas-primary rounded-lg px-3 py-2 text-xs text-saas-text focus:outline-none focus:ring-1 focus:ring-saas-primary font-mono shadow-saas-sm"
        />
        <div className="flex gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setValue('departure_local', now.toISOString().slice(0, 16));
            }}
            className="text-[11px] bg-white hover:bg-slate-50 text-saas-secondary hover:text-saas-text px-2 py-1 rounded-md border border-saas-border transition shadow-saas-sm font-medium"
          >
            Depart Now
          </button>
          <button
            type="button"
            onClick={() => {
              const in2h = new Date(Date.now() + 2 * 3600 * 1000);
              setValue('departure_local', in2h.toISOString().slice(0, 16));
            }}
            className="text-[11px] bg-white hover:bg-slate-50 text-saas-secondary hover:text-saas-text px-2 py-1 rounded-md border border-saas-border transition shadow-saas-sm font-medium"
          >
            +2 Hours
          </button>
          <button
            type="button"
            onClick={() => setValue('departure_local', getDefaultDeparture())}
            className="text-[11px] bg-white hover:bg-slate-50 text-saas-secondary hover:text-saas-text px-2 py-1 rounded-md border border-saas-border transition shadow-saas-sm font-medium"
          >
            Tomorrow 8 AM
          </button>
        </div>
      </div>

      {/* Load Weight in pounds */}
      <div className="bg-saas-subtle p-3 rounded-xl border border-saas-border">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-saas-secondary flex items-center gap-1.5">
            <Weight className="w-3.5 h-3.5 text-amber-600" />
            Truck Gross Cargo Weight
          </label>
          <span className="text-xs font-mono font-bold text-saas-text bg-white px-2 py-0.5 rounded border border-saas-border shadow-saas-sm">
            {Number(watchLoad || 0).toLocaleString()} lb
          </span>
        </div>

        <input
          type="number"
          min="1"
          max="80000"
          step="500"
          {...register('load_lb', { required: true, min: 1, max: 80000 })}
          className="w-full bg-white border border-saas-border focus:border-saas-primary rounded-lg px-3 py-2 text-xs text-saas-text focus:outline-none focus:ring-1 focus:ring-saas-primary font-mono shadow-saas-sm"
        />

        {/* Quick weight selector chips */}
        <div className="flex gap-1.5 mt-2">
          {[20000, 32000, 42000, 65000].map((wt) => (
            <button
              key={wt}
              type="button"
              onClick={() => setValue('load_lb', wt)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition font-mono font-medium ${
                watchLoad === wt
                  ? 'bg-saas-softBlue text-saas-primary border-saas-primary shadow-saas-sm'
                  : 'bg-white text-saas-secondary border-saas-border hover:bg-slate-50'
              }`}
            >
              {(wt / 1000).toFixed(0)}k lb
            </button>
          ))}
        </div>

        {/* Load Rule dynamic status banner */}
        <div className="mt-2.5 text-[11px] p-2 bg-white rounded-lg border border-saas-border text-saas-secondary leading-relaxed shadow-saas-sm">
          <span className="font-semibold text-saas-text">Escalation Policy:</span>{' '}
          {watchLoad > 40000 ? (
            <span className="text-orange-700 font-medium">
              &gt;40,000 lb: Wind 35-44 mph escalates to <strong>Severe</strong>. Wind 45-54 mph triggers <strong>No Travel</strong>.
            </span>
          ) : watchLoad > 30000 ? (
            <span className="text-amber-800 font-medium">
              &gt;30,000 lb: Wind 45-54 mph escalates to <strong>No Travel</strong>.
            </span>
          ) : (
            <span className="text-emerald-700 font-medium">
              &le;30,000 lb: Standard baseline thresholds apply.
            </span>
          )}
        </div>
      </div>

      {/* Advanced Options Accordion */}
      <div className="border border-saas-border rounded-xl overflow-hidden bg-white shadow-saas-sm">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-saas-subtle text-xs font-medium text-saas-secondary hover:text-saas-text transition"
        >
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-saas-primary" />
            Sampling & Algorithm Controls
          </span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="p-3 bg-white space-y-3 text-xs border-t border-saas-border">
            {/* Sampling Policy */}
            <div>
              <label className="block text-saas-secondary mb-1 font-medium">Checkpoint Sampling Interval</label>
              <select
                {...register('sampling_mode')}
                className="w-full bg-saas-subtle border border-saas-border rounded-lg px-2.5 py-1.5 text-saas-text text-xs focus:outline-none focus:border-saas-primary"
              >
                <option value="auto">Auto (10 mi for &le;250mi, 25 mi for &le;800mi, 50 mi for &gt;800mi)</option>
                <option value="fixed">Fixed Interval</option>
              </select>
            </div>

            {watchSampling === 'fixed' && (
              <div>
                <label className="block text-saas-secondary mb-1 font-medium">Fixed Mileage Interval</label>
                <select
                  {...register('interval_mi')}
                  className="w-full bg-saas-subtle border border-saas-border rounded-lg px-2.5 py-1.5 text-saas-text text-xs focus:outline-none focus:border-saas-primary"
                >
                  <option value={10}>Every 10 Miles</option>
                  <option value={25}>Every 25 Miles</option>
                  <option value={50}>Every 50 Miles</option>
                </select>
              </div>
            )}

            {/* Ranking Mode */}
            <div>
              <label className="block text-saas-secondary mb-1 font-medium">Recommendation Hierarchy</label>
              <select
                {...register('ranking_mode')}
                className="w-full bg-saas-subtle border border-saas-border rounded-lg px-2.5 py-1.5 text-saas-text text-xs focus:outline-none focus:border-saas-primary"
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
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 shadow-saas-sm">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMsg}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-saas-primary hover:bg-saas-primaryHover disabled:bg-blue-300 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-saas transition cursor-pointer"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
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
