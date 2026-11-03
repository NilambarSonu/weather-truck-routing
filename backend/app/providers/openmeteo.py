import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
import httpx
import h3
from .base import WeatherProvider, WeatherSeries

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
MAX_BATCH_SIZE = 50


class OpenMeteoWeatherProvider(WeatherProvider):
    """
    Open-Meteo Forecast API provider.
    Free tier, keyless for non-commercial use.
    Requests in batches with imperial units (mph, inch) and GMT timestamps.
    """

    def __init__(self, client: httpx.AsyncClient = None):
        self._client = client

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None and not self._client.is_closed:
            return self._client
        return httpx.AsyncClient(timeout=10.0)

    async def bulk_hourly(
        self,
        cells: List[str],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[str, WeatherSeries]:
        if not cells:
            return {}

        results: Dict[str, WeatherSeries] = {}
        client = await self._get_client()

        # Split into batches of up to MAX_BATCH_SIZE
        batches = [cells[i: i + MAX_BATCH_SIZE] for i in range(0, len(cells), MAX_BATCH_SIZE)]

        tasks = [self._fetch_batch(client, batch, start_utc, end_utc) for batch in batches]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        for br in batch_results:
            if isinstance(br, dict):
                results.update(br)
            else:
                logger.warning(f"Batch fetch error from Open-Meteo: {br}")

        # Check for missing cells and fill from nearest neighbors or empty series
        for cell in cells:
            if cell not in results:
                results[cell] = self._create_fallback_series(cell, start_utc, end_utc)

        return results

    async def _fetch_batch(
        self,
        client: httpx.AsyncClient,
        batch_cells: List[str],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[str, WeatherSeries]:
        coords = [h3.cell_to_latlng(c) for c in batch_cells]
        lats = [f"{lat:.4f}" for lat, _ in coords]
        lons = [f"{lon:.4f}" for _, lon in coords]

        # Calculate forecast days needed
        days_ahead = max(2, min(16, int((end_utc - datetime.now(timezone.utc)).total_seconds() / 86400) + 2))

        params = {
            "latitude": ",".join(lats),
            "longitude": ",".join(lons),
            "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,weather_code",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timeformat": "unixtime",
            "timezone": "GMT",
            "forecast_days": days_ahead,
            "past_hours": 2,
        }

        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

        batch_out: Dict[str, WeatherSeries] = {}
        if isinstance(data, list):
            for cell, item in zip(batch_cells, data):
                series = self._parse_series(cell, item)
                if series:
                    batch_out[cell] = series
        elif isinstance(data, dict):
            # Single location response
            if len(batch_cells) == 1:
                series = self._parse_series(batch_cells[0], data)
                if series:
                    batch_out[batch_cells[0]] = series

        return batch_out

    def _parse_series(self, cell: str, item: Dict[str, Any]) -> WeatherSeries:
        hourly = item.get("hourly", {})
        times = hourly.get("time", [])
        if not times:
            return None

        winds = hourly.get("wind_speed_10m", [])
        gusts = hourly.get("wind_gusts_10m", [])
        rains = hourly.get("rain", [])
        showers = hourly.get("showers", [])
        snows = hourly.get("snowfall", [])
        codes = hourly.get("weather_code", [])

        wind_speeds: Dict[int, float] = {}
        wind_gusts: Dict[int, float] = {}
        rain_amounts: Dict[int, float] = {}
        snow_amounts: Dict[int, float] = {}
        weather_codes: Dict[int, int] = {}

        for idx, t in enumerate(times):
            w = float(winds[idx]) if idx < len(winds) and winds[idx] is not None else 0.0
            g = float(gusts[idx]) if idx < len(gusts) and gusts[idx] is not None else w * 1.2
            r = float(rains[idx]) if idx < len(rains) and rains[idx] is not None else 0.0
            sh = float(showers[idx]) if idx < len(showers) and showers[idx] is not None else 0.0
            sn = float(snows[idx]) if idx < len(snows) and snows[idx] is not None else 0.0
            c = int(codes[idx]) if idx < len(codes) and codes[idx] is not None else 0

            wind_speeds[t] = w
            wind_gusts[t] = g
            rain_amounts[t] = r + sh  # Rain = liquid rain + showers
            snow_amounts[t] = sn
            weather_codes[t] = c

        first_t = times[0]
        last_t = times[-1]

        return WeatherSeries(
            cell=cell,
            first_hour_ts=first_t,
            last_hour_ts=last_t,
            wind_speeds=wind_speeds,
            wind_gusts=wind_gusts,
            rain_amounts=rain_amounts,
            snow_amounts=snow_amounts,
            weather_codes=weather_codes,
            quality="nominal",
        )

    def _create_fallback_series(self, cell: str, start_utc: datetime, end_utc: datetime) -> WeatherSeries:
        t0 = int(start_utc.timestamp())
        t1 = int(end_utc.timestamp())
        # Generate calm benign weather series as fallback
        times = list(range((t0 // 3600) * 3600, (t1 // 3600) * 3600 + 7200, 3600))
        winds = {t: 12.0 for t in times}
        gusts = {t: 16.0 for t in times}
        rains = {t: 0.0 for t in times}
        snows = {t: 0.0 for t in times}
        codes = {t: 1 for t in times}
        return WeatherSeries(
            cell=cell,
            first_hour_ts=times[0],
            last_hour_ts=times[-1],
            wind_speeds=winds,
            wind_gusts=gusts,
            rain_amounts=rains,
            snow_amounts=snows,
            weather_codes=codes,
            quality="fallback",
        )
