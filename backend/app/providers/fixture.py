import math
from datetime import datetime, timezone
from typing import List, Dict, Tuple, Optional
import h3
from app.domain.models import RoutePath, Place
from .base import WeatherProvider, RoutingProvider, WeatherSeries
from .demo_routes import get_demo_routes


class FixtureRoutingProvider(RoutingProvider):
    """
    Deterministic routing provider generating 3 genuinely distinct realistic routes.
    Works anywhere in the US without external API credentials.
    """

    async def routes(
        self,
        origin: Place,
        dest: Place,
        vehicle_weight_kg: int,
        depart_utc: datetime,
        alternatives: int = 2,
    ) -> List[RoutePath]:
        return get_demo_routes(origin, dest)

    async def route_via(
        self,
        origin: Place,
        dest: Place,
        via: Tuple[float, float],
        vehicle_weight_kg: int,
        depart_utc: datetime,
    ) -> Optional[RoutePath]:
        routes = get_demo_routes(origin, dest)
        return routes[1] if len(routes) > 1 else routes[0]


class FixtureWeatherProvider(WeatherProvider):
    """
    Deterministic synthetic weather provider supporting scenarios S1-S5 from Section 11.5.
    Guarantees reproducible, explainable weather risk and dynamic front movements.
    """

    def __init__(self, scenario: str = "S2_WIND_FRONT"):
        self.scenario = scenario.upper()

    async def bulk_hourly(
        self,
        cells: List[str],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[str, WeatherSeries]:
        t0 = int(start_utc.timestamp())
        t1 = int(end_utc.timestamp())
        times = list(range((t0 // 3600) * 3600, (t1 // 3600) * 3600 + 7200, 3600))
        results: Dict[str, WeatherSeries] = {}

        # Get bounding box or center of cells to define synthetic weather fronts
        coords = [h3.cell_to_latlng(c) for c in cells]
        if coords:
            min_lat = min(c[0] for c in coords)
            max_lat = max(c[0] for c in coords)
            min_lon = min(c[1] for c in coords)
            max_lon = max(c[1] for c in coords)
            mid_lon = (min_lon + max_lon) / 2.0
            mid_lat = (min_lat + max_lat) / 2.0
            lon_span = max(1.0, max_lon - min_lon)
        else:
            min_lat, max_lat, min_lon, max_lon = 40.0, 42.0, -90.0, -85.0
            mid_lon, mid_lat, lon_span = -87.5, 41.0, 5.0

        for cell in cells:
            lat, lon = h3.cell_to_latlng(cell)
            wind_speeds: Dict[int, float] = {}
            wind_gusts: Dict[int, float] = {}
            rain_amounts: Dict[int, float] = {}
            snow_amounts: Dict[int, float] = {}
            weather_codes: Dict[int, int] = {}

            for t in times:
                hours_from_start = (t - t0) / 3600.0

                if self.scenario == "S1_CLEAR":
                    w = 12.0 + 3.0 * math.sin(lon + hours_from_start)
                    r = 0.0
                    s = 0.0
                    c = 1

                elif self.scenario in ("S2_WIND_FRONT", "WIND_FRONT", "DEFAULT"):
                    # High wind front (38 to 48 mph) positioned in the central longitude band
                    dist_to_front = abs(lon - (mid_lon + 0.1 * lon_span))
                    front_intensity = max(0.0, 1.0 - (dist_to_front / (0.25 * lon_span)))
                    w = 14.0 + front_intensity * 32.0  # Peaks at 46.0 mph
                    r = 0.05 * front_intensity
                    s = 0.0
                    c = 3 if front_intensity > 0.5 else 1

                elif self.scenario == "S3_SNOW_BAND":
                    # Northern corridor gets heavy snow, southern corridor stays clear
                    dist_north = max(0.0, (lat - mid_lat) / 2.0)
                    snow_factor = min(1.0, max(0.0, dist_north))
                    w = 18.0 + snow_factor * 10.0
                    r = 0.0
                    s = snow_factor * 2.4  # Up to 2.4 in/hr (Severe snow)
                    c = 71 if s > 0.5 else 1

                elif self.scenario == "S4_ALL_BLOCKED":
                    # Severe hurricane-force winds across all routes
                    w = 58.0  # >= 55 mph -> No Travel for all loads
                    r = 1.2
                    s = 0.0
                    c = 95

                elif self.scenario == "S5_MOVING_STORM":
                    # Storm front sweeps from West to East across 48 hours
                    storm_lon = min_lon + (hours_from_start / 48.0) * lon_span
                    dist_to_storm = abs(lon - storm_lon)
                    storm_intensity = max(0.0, 1.0 - (dist_to_storm / (0.15 * lon_span)))
                    w = 12.0 + storm_intensity * 35.0  # Up to 47 mph
                    r = storm_intensity * 0.7  # Up to 0.7 in/hr (Severe rain)
                    s = 0.0
                    c = 61 if r > 0.2 else 1

                else:
                    w = 15.0
                    r = 0.0
                    s = 0.0
                    c = 1

                wind_speeds[t] = round(max(0.0, w), 1)
                wind_gusts[t] = round(max(0.0, w * 1.25), 1)
                rain_amounts[t] = round(max(0.0, r), 2)
                snow_amounts[t] = round(max(0.0, s), 2)
                weather_codes[t] = c

            results[cell] = WeatherSeries(
                cell=cell,
                first_hour_ts=times[0],
                last_hour_ts=times[-1],
                wind_speeds=wind_speeds,
                wind_gusts=wind_gusts,
                rain_amounts=rain_amounts,
                snow_amounts=snow_amounts,
                weather_codes=weather_codes,
                quality="nominal",
            )

        return results
