from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from app.domain.models import RoutePath
from app.domain.heatmap import build_corridor_cells, build_heatmap_matrix
from app.domain.geometry import decode_geometry
from app.providers.base import WeatherProvider
from app.providers.fixture import FixtureWeatherProvider
from app.providers.openmeteo import OpenMeteoWeatherProvider
import os


class HeatmapService:
    def __init__(self, weather_provider: WeatherProvider = None):
        weather_type = os.getenv("WEATHER_PROVIDER", "openmeteo").lower()
        scenario = os.getenv("DEMO_SCENARIO", "S2_WIND_FRONT")
        if weather_provider:
            self.weather_provider = weather_provider
        elif weather_type == "fixture":
            self.weather_provider = FixtureWeatherProvider(scenario=scenario)
        else:
            self.weather_provider = OpenMeteoWeatherProvider()

    async def generate_heatmap(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        routes_json = plan_data.get("routes", [])
        req_json = plan_data.get("request", {})
        meta_json = plan_data.get("meta", {})

        load_lb = int(req_json.get("load_lb", 40000))
        dep_str = req_json.get("departure_utc", datetime.now(timezone.utc).isoformat())
        t0_utc = datetime.fromisoformat(dep_str.replace("Z", "+00:00"))
        h3_res = int(meta_json.get("h3_res", 5))

        # Reconstruct route objects
        route_paths: List[RoutePath] = []
        for r_item in routes_json:
            geom = r_item.get("geometry", "")
            lats, lons = decode_geometry(geom)
            route_paths.append(
                RoutePath(
                    id=r_item.get("id", "A"),
                    label=r_item.get("label", ""),
                    lat=lats,
                    lon=lons,
                    cum_m=[],
                    offsets_m=[],
                    cum_s=[],
                    distance_m=r_item.get("distance_mi", 0) * 1609.344,
                    duration_s=r_item.get("duration_s", 0),
                    provider_ref="",
                    display_geometry=geom,
                )
            )

        corridor_cells = build_corridor_cells(
            routes=route_paths,
            half_width_mi=20.0,
            h3_res=h3_res,
            max_cells=400,
        )

        end_utc = t0_utc + timedelta(hours=50)
        weather_by_cell = await self.weather_provider.bulk_hourly(
            cells=corridor_cells,
            start_utc=t0_utc,
            end_utc=end_utc,
        )

        matrix = build_heatmap_matrix(
            cells=corridor_cells,
            weather_series_by_cell=weather_by_cell,
            t0_utc=t0_utc,
            load_lb=load_lb,
            hours_count=49,
        )

        return matrix
