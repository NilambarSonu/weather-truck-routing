export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL';

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export interface WeatherValues {
  wind_mph: number;
  gust_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  weather_code: number;
  quality: string;
  forecast_hour_used: string;
}

export interface RiskValues {
  overall: RiskLevel;
  dominant: 'wind' | 'rain' | 'snow' | null;
  continuous_index: number;
  levels: {
    wind: RiskLevel;
    rain: RiskLevel;
    snow: RiskLevel;
  };
  load_rule_applied: string | null;
}

export interface Checkpoint {
  index: number;
  dist_mi: number;
  dist_m: number;
  lat: number;
  lon: number;
  eta_utc: string;
  tz: string;
  cell: string;
  owned_mi: number;
  weather: WeatherValues;
  risk: RiskValues;
}

export interface RouteMetrics {
  distance_mi: number;
  duration_s: number;
  severe_mi: number;
  high_mi: number;
  moderate_mi: number;
  low_mi: number;
  no_travel_mi: number;
  avg_risk: number;
  max_level: RiskLevel;
  worst_checkpoint_index: number;
  hours_at_high_or_worse: number;
}

export interface Route {
  id: string;
  label: string;
  distance_mi: number;
  duration_s: number;
  geometry: string;
  metrics: RouteMetrics;
  gradient: [number, string][];
  checkpoints: Checkpoint[];
}

export interface Reason {
  tier: string;
  values: Record<string, number>;
  kept: string[];
  decisive: boolean;
}

export interface Recommendation {
  winner_route_id: string | null;
  blocked: boolean;
  summary: string;
  reasons: Reason[];
  advice?: {
    all_blocked?: boolean;
    lowest_no_travel_route_id?: string;
    suggested_action?: string;
  };
}

export interface TripPlanRequest {
  origin: Place;
  destination: Place;
  departure_local: string;
  load_lb: number;
  sampling?: {
    mode: 'auto' | 'fixed';
    interval_mi?: number;
  };
  options?: {
    ranking?: 'tolerant' | 'strict';
    hos?: boolean;
  };
}

export interface TripPlan {
  id: string;
  meta: {
    algo_version: string;
    weather_provider: string;
    routing_provider: string;
    h3_res: number;
    unique_cells: number;
    warnings: string[];
    server_timing: {
      total_ms: number;
      routing_ms: number;
      weather_ms: number;
    };
  };
  request: {
    origin: Place;
    destination: Place;
    departure_utc: string;
    origin_tz: string;
    load_lb: number;
    sampling: {
      mode: string;
      interval_mi: number;
    };
  };
  recommendation: Recommendation;
  routes: Route[];
}

export interface HeatmapPayload {
  meta: {
    t0_utc: string;
    step_s: number;
    hours: number;
    cell_count: number;
    load_lb: number;
  };
  cells: string[];
  layers: {
    overall: string;
    wind: string;
    rain: string;
    snow: string;
    classes: string;
  };
}
