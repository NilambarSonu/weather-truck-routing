import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { TripPlan, HeatmapPayload, Checkpoint } from '../api/types';

export type WeatherLayerMode = 'overall' | 'wind' | 'rain' | 'snow';

interface TripStoreState {
  plan: TripPlan | null;
  selectedRouteId: string | null;
  hoveredCheckpoint: Checkpoint | null;
  heatmapPayload: HeatmapPayload | null;
  heatmapHour: number; // 0.0 to 48.0
  isPlaying: boolean;
  activeLayer: WeatherLayerMode;
  showHeatmap: boolean;
  isHeatmapLoading: boolean;

  setPlan: (plan: TripPlan) => void;
  setSelectedRouteId: (id: string) => void;
  setHoveredCheckpoint: (cp: Checkpoint | null) => void;
  setHeatmapPayload: (payload: HeatmapPayload | null) => void;
  setHeatmapHour: (hour: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setActiveLayer: (layer: WeatherLayerMode) => void;
  setShowHeatmap: (show: boolean) => void;
  setIsHeatmapLoading: (loading: boolean) => void;
}

export const useTripStore = create<TripStoreState>()(
  subscribeWithSelector((set) => ({
    plan: null,
    selectedRouteId: null,
    hoveredCheckpoint: null,
    heatmapPayload: null,
    heatmapHour: 0.0,
    isPlaying: false,
    activeLayer: 'overall',
    showHeatmap: true,
    isHeatmapLoading: false,

    setPlan: (plan) => {
      const winnerId = plan.recommendation.winner_route_id || (plan.routes[0]?.id ?? null);
      set({
        plan,
        selectedRouteId: winnerId,
        hoveredCheckpoint: null,
        heatmapPayload: null,
        heatmapHour: 0.0,
        isPlaying: false,
      });
    },

    setSelectedRouteId: (id) => set({ selectedRouteId: id }),
    setHoveredCheckpoint: (cp) => set({ hoveredCheckpoint: cp }),
    setHeatmapPayload: (payload) => set({ heatmapPayload: payload, isHeatmapLoading: false }),
    setHeatmapHour: (hour) => set({ heatmapHour: Math.max(0, Math.min(48, hour)) }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setActiveLayer: (layer) => set({ activeLayer: layer }),
    setShowHeatmap: (show) => set({ showHeatmap: show }),
    setIsHeatmapLoading: (loading) => set({ isHeatmapLoading: loading }),
  }))
);
