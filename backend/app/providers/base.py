from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
from app.domain.models import RoutePath, Place, WeatherSample


class WeatherSeries:
    """Represents an hourly time series of weather for one H3 cell."""

    def __init__(
        self,
        cell: str,
        first_hour_ts: int,
        last_hour_ts: int,
        wind_speeds: Dict[int, float],  # timestamp -> mph
        wind_gusts: Dict[int, float],
        rain_amounts: Dict[int, float],  # timestamp -> in/hr (preceding hour sum)
        snow_amounts: Dict[int, float],
        weather_codes: Dict[int, int],
        quality: str = "nominal",
    ):
        self.cell = cell
        self.first_hour_ts = first_hour_ts
        self.last_hour_ts = last_hour_ts
        self.wind_speeds = wind_speeds
        self.wind_gusts = wind_gusts
        self.rain_amounts = rain_amounts
        self.snow_amounts = snow_amounts
        self.weather_codes = weather_codes
        self.quality = quality

    def get_wind_at(self, timestamp: int) -> float:
        """
        Instantaneous wind speed: linear interpolation between floor hour and ceil hour.
        """
        h_floor = (timestamp // 3600) * 3600
        h_ceil = h_floor + 3600
        w0 = self.wind_speeds.get(h_floor, self.wind_speeds.get(self.first_hour_ts, 0.0))
        w1 = self.wind_speeds.get(h_ceil, w0)
        frac = (timestamp - h_floor) / 3600.0
        return (1.0 - frac) * w0 + frac * w1

    def get_gust_at(self, timestamp: int) -> float:
        h_floor = (timestamp // 3600) * 3600
        h_ceil = h_floor + 3600
        g0 = self.wind_gusts.get(h_floor, self.wind_gusts.get(self.first_hour_ts, 0.0))
        g1 = self.wind_gusts.get(h_ceil, g0)
        frac = (timestamp - h_floor) / 3600.0
        return (1.0 - frac) * g0 + frac * g1

    def get_rain_at(self, timestamp: int) -> float:
        """
        Preceding-hour sum: bucket is floor(timestamp) + 3600.
        E.g., ETA 14:20 is inside [14:00, 15:00), represented by the 15:00 bucket.
        """
        label_ts = (timestamp // 3600) * 3600 + 3600
        return self.rain_amounts.get(label_ts, 0.0)

    def get_snow_at(self, timestamp: int) -> float:
        """Preceding-hour sum: bucket is floor(timestamp) + 3600."""
        label_ts = (timestamp // 3600) * 3600 + 3600
        return self.snow_amounts.get(label_ts, 0.0)

    def sample_at(self, dt_utc: datetime) -> WeatherSample:
        ts = int(dt_utc.timestamp())
        h_label = ((ts // 3600) * 3600) + 3600
        hour_dt = datetime.fromtimestamp(h_label, tz=dt_utc.tzinfo)
        return WeatherSample(
            cell=self.cell,
            wind_mph=round(self.get_wind_at(ts), 1),
            gust_mph=round(self.get_gust_at(ts), 1),
            rain_in_hr=round(self.get_rain_at(ts), 2),
            snow_in_hr=round(self.get_snow_at(ts), 2),
            weather_code=self.weather_codes.get(h_label, 0),
            forecast_hour_used=hour_dt,
            quality=self.quality,
        )


class RoutingProvider(ABC):
    @abstractmethod
    async def routes(
        self,
        origin: Place,
        dest: Place,
        vehicle_weight_kg: int,
        depart_utc: datetime,
        alternatives: int = 2,
    ) -> List[RoutePath]:
        pass

    @abstractmethod
    async def route_via(
        self,
        origin: Place,
        dest: Place,
        via: Tuple[float, float],
        vehicle_weight_kg: int,
        depart_utc: datetime,
    ) -> Optional[RoutePath]:
        pass


class GeocodeProvider(ABC):
    @abstractmethod
    async def suggest(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        pass


class WeatherProvider(ABC):
    @abstractmethod
    async def bulk_hourly(
        self,
        cells: List[str],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[str, WeatherSeries]:
        pass
