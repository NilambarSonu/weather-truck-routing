from dataclasses import dataclass, field
from enum import IntEnum
from typing import List, Optional, Dict, Any
from datetime import datetime


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name

    @classmethod
    def from_string(cls, name: str) -> "RiskLevel":
        return cls[name.upper()]


@dataclass
class Place:
    label: str
    lat: float
    lon: float


@dataclass
class SamplingConfig:
    mode: str = "auto"  # "auto" | "fixed"
    interval_mi: float = 25.0


@dataclass
class TripRequest:
    origin: Place
    destination: Place
    departure_utc: datetime
    origin_tz: str
    load_lb: int
    sampling: SamplingConfig = field(default_factory=SamplingConfig)
    options: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RoutePath:
    id: str
    label: str
    lat: List[float]
    lon: List[float]
    cum_m: List[float]
    offsets_m: List[float]
    cum_s: List[float]
    distance_m: float
    duration_s: float
    provider_ref: str
    display_geometry: str  # Encoded polyline string
    warnings: List[str] = field(default_factory=list)


@dataclass
class Checkpoint:
    index: int
    dist_m: float
    dist_mi: float
    lat: float
    lon: float
    eta_utc: datetime
    tz: str
    cell: str
    owned_lo_m: float
    owned_hi_m: float
    owned_mi: float


@dataclass
class WeatherSample:
    cell: str
    wind_mph: float
    gust_mph: float
    rain_in_hr: float
    snow_in_hr: float
    weather_code: int
    forecast_hour_used: datetime
    quality: str = "nominal"  # "nominal" | "estimated" | "fallback"


@dataclass
class CheckpointRisk:
    levels: Dict[str, RiskLevel]  # wind, rain, snow
    overall: RiskLevel
    dominant: Optional[str]  # "wind" | "rain" | "snow" | None
    continuous_index: float  # 0.0 - 4.0
    load_rule_applied: Optional[str] = None


@dataclass
class EvaluatedCheckpoint:
    checkpoint: Checkpoint
    weather: WeatherSample
    risk: CheckpointRisk


@dataclass
class RouteMetrics:
    distance_mi: float
    duration_s: float
    severe_mi: float
    high_mi: float
    moderate_mi: float
    low_mi: float
    no_travel_mi: float
    avg_risk: float
    max_level: RiskLevel
    worst_checkpoint_index: int
    gradient: List[List[Any]]  # list of [fraction: float, level_name: str]
    hours_at_high_or_worse: float = 0.0


@dataclass
class EvaluatedRoute:
    route: RoutePath
    checkpoints: List[EvaluatedCheckpoint]
    metrics: RouteMetrics


@dataclass
class Reason:
    tier: str
    values: Dict[str, float]
    kept: List[str]
    decisive: bool


@dataclass
class Recommendation:
    winner_route_id: Optional[str]
    blocked: bool
    reasons: List[Reason]
    summary: str
    advice: Optional[Dict[str, Any]] = None
