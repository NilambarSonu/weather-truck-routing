import logging
from datetime import datetime
from typing import List, Tuple, Optional
import httpx
from app.domain.models import RoutePath, Place
from app.domain.geometry import (
    decode_geometry,
    encode_geometry,
    build_cumulative_distances,
    drop_consecutive_duplicates,
    grid_cells,
    compute_overlap,
    perpendicular_points,
)
from .base import RoutingProvider
from .demo_routes import get_demo_routes

logger = logging.getLogger(__name__)


class TomTomRoutingProvider(RoutingProvider):
    """
    TomTom Calculate Route v1 provider with truck profile and alternative routes.
    Gracefully falls back to deterministic demo routes when API key is not present.
    """

    def __init__(self, api_key: Optional[str] = None, client: Optional[httpx.AsyncClient] = None):
        self.api_key = api_key
        self._client = client

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None and not self._client.is_closed:
            return self._client
        return httpx.AsyncClient(timeout=10.0)

    async def routes(
        self,
        origin: Place,
        dest: Place,
        vehicle_weight_kg: int,
        depart_utc: datetime,
        alternatives: int = 2,
    ) -> List[RoutePath]:
        if not self.api_key:
            return get_demo_routes(origin, dest)

        try:
            client = await self._get_client()
            url = f"https://api.tomtom.com/routing/1/calculateRoute/{origin.lat},{origin.lon}:{dest.lat},{dest.lon}/json"
            params = {
                "key": self.api_key,
                "travelMode": "truck",
                "vehicleWeight": str(vehicle_weight_kg),
                "maxAlternatives": str(alternatives),
                "routeType": "fastest",
                "instructionsType": "tagged",
            }
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                raw_routes = data.get("routes", [])
                candidates: List[RoutePath] = []
                for idx, r_item in enumerate(raw_routes):
                    rp = self._parse_tomtom_route(r_item, idx)
                    if rp:
                        candidates.append(rp)

                if len(candidates) >= 3:
                    return candidates[:3]
                elif candidates:
                    # Supplement using via point diversification
                    return await self._diversify_routes(origin, dest, vehicle_weight_kg, depart_utc, candidates)
        except Exception as e:
            logger.warning(f"TomTom routing call failed, using fallback routes: {e}")

        return get_demo_routes(origin, dest)

    async def route_via(
        self,
        origin: Place,
        dest: Place,
        via: Tuple[float, float],
        vehicle_weight_kg: int,
        depart_utc: datetime,
    ) -> Optional[RoutePath]:
        if not self.api_key:
            return None

        try:
            client = await self._get_client()
            url = f"https://api.tomtom.com/routing/1/calculateRoute/{origin.lat},{origin.lon}:{via[0]},{via[1]}:{dest.lat},{dest.lon}/json"
            params = {
                "key": self.api_key,
                "travelMode": "truck",
                "vehicleWeight": str(vehicle_weight_kg),
                "routeType": "fastest",
            }
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                raw_routes = data.get("routes", [])
                if raw_routes:
                    return self._parse_tomtom_route(raw_routes[0], 99)
        except Exception as e:
            logger.warning(f"TomTom via-point route failed: {e}")
        return None

    def _parse_tomtom_route(self, r_item: dict, idx: int) -> Optional[RoutePath]:
        summary = r_item.get("summary", {})
        length_m = float(summary.get("lengthInMeters", 0.0))
        duration_s = float(summary.get("travelTimeInSeconds", 0.0))
        legs = r_item.get("legs", [])
        if not legs:
            return None

        all_lats: List[float] = []
        all_lons: List[float] = []
        for leg in legs:
            pts = leg.get("points", [])
            for p in pts:
                all_lats.append(float(p.get("latitude", 0.0)))
                all_lons.append(float(p.get("longitude", 0.0)))

        lats, lons = drop_consecutive_duplicates(all_lats, all_lons)
        cum_m = build_cumulative_distances(lats, lons, length_m)

        # Build step time curve from legs/steps if present
        offsets_m = list(cum_m)
        cum_s = [(m / length_m) * duration_s for m in cum_m] if length_m > 0 else [0.0] * len(cum_m)

        label = "Fastest Route" if idx == 0 else f"Alternative {chr(ord('A') + idx - 1)}"
        route_id = chr(ord("A") + idx)
        display_geom = encode_geometry(lats, lons, precision=6)

        return RoutePath(
            id=route_id,
            label=label,
            lat=lats,
            lon=lons,
            cum_m=cum_m,
            offsets_m=offsets_m,
            cum_s=cum_s,
            distance_m=length_m,
            duration_s=duration_s,
            provider_ref=f"tomtom_{idx}",
            display_geometry=display_geom,
        )

    async def _diversify_routes(
        self,
        origin: Place,
        dest: Place,
        vehicle_weight_kg: int,
        depart_utc: datetime,
        candidates: List[RoutePath],
    ) -> List[RoutePath]:
        """Uses perpendicular via points to ensure 3 distinct routes."""
        picked = list(candidates)
        base = candidates[0]
        vias = perpendicular_points(base.lat, base.lon, base.cum_m, fractions=(0.35, 0.50, 0.65))

        for v in vias:
            if len(picked) >= 3:
                break
            via_route = await self.route_via(origin, dest, v, vehicle_weight_kg, depart_utc)
            if via_route and via_route.duration_s <= 1.6 * base.duration_s:
                # Check overlap
                c_v = grid_cells(via_route.lat, via_route.lon)
                is_distinct = all(
                    compute_overlap(c_v, grid_cells(p.lat, p.lon)) < 0.85
                    for p in picked
                )
                if is_distinct:
                    via_route.id = chr(ord("A") + len(picked))
                    via_route.label = f"Alternative {chr(ord('A') + len(picked) - 1)}"
                    picked.append(via_route)

        # If still fewer than 3, supplement from demo routes
        demo_alts = get_demo_routes(origin, dest)
        while len(picked) < 3 and len(demo_alts) > len(picked):
            extra = demo_alts[len(picked)]
            extra.id = chr(ord("A") + len(picked))
            picked.append(extra)

        return picked[:3]
