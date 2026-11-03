import logging
import os
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.domain.models import (
    TripRequest,
    RoutePath,
    EvaluatedRoute,
    EvaluatedCheckpoint,
    Recommendation,
)
from app.domain.checkpoints import build_checkpoints
from app.domain.timecurve import TimeCurve
from app.domain.risk import classify_checkpoint
from app.domain.attribution import compute_route_metrics
from app.domain.ranking import recommend_route, RankingConfig
from app.providers.base import RoutingProvider, WeatherProvider, GeocodeProvider
from app.providers.fixture import FixtureRoutingProvider, FixtureWeatherProvider
from app.providers.tomtom import TomTomRoutingProvider
from app.providers.openmeteo import OpenMeteoWeatherProvider
from app.providers.geocode import TomTomGeocodeProvider, PhotonGeocodeProvider

logger = logging.getLogger(__name__)

TRUCK_TARE_LB = int(os.getenv("TRUCK_TARE_LB", "33000"))


class PlanOrchestrator:
    """
    Coordinates Stages 1-10 of the processing pipeline:
    1. Validation & normalization
    2. Route generation
    3. Time curve & geometry
    4. Checkpoints & ETAs
    5. H3 cell mapping
    6. Weather lookup
    7. Risk classification
    8. Mile attribution & metrics
    9. Route recommendation & explanation
    """

    def __init__(
        self,
        routing_provider: Optional[RoutingProvider] = None,
        weather_provider: Optional[WeatherProvider] = None,
        geocode_provider: Optional[GeocodeProvider] = None,
    ):
        scenario = os.getenv("DEMO_SCENARIO", "S2_WIND_FRONT")
        weather_type = os.getenv("WEATHER_PROVIDER", "openmeteo").lower()
        routing_type = os.getenv("ROUTING_PROVIDER", "tomtom").lower()
        tomtom_key = os.getenv("TOMTOM_API_KEY", "")

        # Default providers with graceful fallbacks
        if routing_provider:
            self.routing_provider = routing_provider
        elif routing_type == "fixture" or not tomtom_key:
            self.routing_provider = FixtureRoutingProvider()
        else:
            self.routing_provider = TomTomRoutingProvider(api_key=tomtom_key)

        if weather_provider:
            self.weather_provider = weather_provider
        elif weather_type == "fixture":
            self.weather_provider = FixtureWeatherProvider(scenario=scenario)
        else:
            self.weather_provider = OpenMeteoWeatherProvider()

        if geocode_provider:
            self.geocode_provider = geocode_provider
        elif tomtom_key:
            self.geocode_provider = TomTomGeocodeProvider(api_key=tomtom_key)
        else:
            self.geocode_provider = PhotonGeocodeProvider()

    async def create_plan(self, request: TripRequest) -> Dict[str, Any]:
        t_start = time.perf_counter()
        warnings: List[str] = []

        # Total vehicle weight in kg for routing API
        total_vehicle_lb = request.load_lb + TRUCK_TARE_LB
        vehicle_weight_kg = int(total_vehicle_lb * 0.453592)

        # Stage 3: Generate routes
        t_route_0 = time.perf_counter()
        routes = await self.routing_provider.routes(
            origin=request.origin,
            dest=request.destination,
            vehicle_weight_kg=vehicle_weight_kg,
            depart_utc=request.departure_utc,
            alternatives=2,
        )
        t_route_ms = (time.perf_counter() - t_route_0) * 1000

        if not routes:
            raise ValueError("No drivable routes found between specified origin and destination.")

        if not os.getenv("TOMTOM_API_KEY"):
            warnings.append(
                "Keyless demo routing active (synthetic highway corridors). "
                "Set TOMTOM_API_KEY to activate live commercial truck routing."
            )

        # Stage 4 & 5: Geometry, time curve, checkpoints for each route
        h3_res = 5
        max_dist_mi = max(r.distance_m / 1609.344 for r in routes)
        if max_dist_mi > 700:
            h3_res = 4

        use_hos = request.options.get("hos", False)
        all_route_checkpoints = []
        unique_cells = set()

        for route in routes:
            tc = TimeCurve(
                offsets_m=route.offsets_m,
                cum_s=route.cum_s,
                total_distance_m=route.distance_m,
                total_duration_s=route.duration_s,
            )
            cps = build_checkpoints(
                lats=route.lat,
                lons=route.lon,
                cum_m=route.cum_m,
                total_distance_m=route.distance_m,
                time_curve=tc,
                departure_utc=request.departure_utc,
                sampling=request.sampling,
                h3_res=h3_res,
                use_hos=use_hos,
            )
            all_route_checkpoints.append(cps)
            for cp in cps:
                unique_cells.add(cp.cell)

        # Stage 7: Weather fetch
        t_wx_0 = time.perf_counter()
        earliest_eta = min(cps[0].eta_utc for cps in all_route_checkpoints)
        latest_eta = max(cps[-1].eta_utc for cps in all_route_checkpoints)

        weather_by_cell = await self.weather_provider.bulk_hourly(
            cells=list(unique_cells),
            start_utc=earliest_eta,
            end_utc=latest_eta,
        )
        t_wx_ms = (time.perf_counter() - t_wx_0) * 1000

        # Stage 8 & 9: Classify checkpoints & attribute route metrics
        evaluated_routes: List[EvaluatedRoute] = []

        for route, cps in zip(routes, all_route_checkpoints):
            evaluated_cps: List[EvaluatedCheckpoint] = []
            for cp in cps:
                series = weather_by_cell.get(cp.cell)
                if series:
                    sample = series.sample_at(cp.eta_utc)
                else:
                    warnings.append(f"Missing weather data for checkpoint {cp.index}; used estimated values.")
                    sample = OpenMeteoWeatherProvider()._create_fallback_series(
                        cp.cell, earliest_eta, latest_eta
                    ).sample_at(cp.eta_utc)

                risk = classify_checkpoint(sample, request.load_lb)
                evaluated_cps.append(EvaluatedCheckpoint(checkpoint=cp, weather=sample, risk=risk))

            metrics = compute_route_metrics(route, evaluated_cps)
            evaluated_routes.append(
                EvaluatedRoute(
                    route=route,
                    checkpoints=evaluated_cps,
                    metrics=metrics,
                )
            )

        # Stage 10: Recommendation & ranking
        ranking_mode = request.options.get("ranking", "tolerant")
        rec = recommend_route(evaluated_routes, RankingConfig(mode=ranking_mode))

        t_total_ms = (time.perf_counter() - t_start) * 1000

        return {
            "meta": {
                "algo_version": "1.0.0",
                "weather_provider": os.getenv("WEATHER_PROVIDER", "openmeteo"),
                "routing_provider": os.getenv("ROUTING_PROVIDER", "tomtom" if os.getenv("TOMTOM_API_KEY") else "demo"),
                "h3_res": h3_res,
                "unique_cells": len(unique_cells),
                "warnings": warnings,
                "server_timing": {
                    "total_ms": round(t_total_ms, 1),
                    "routing_ms": round(t_route_ms, 1),
                    "weather_ms": round(t_wx_ms, 1),
                },
            },
            "request": {
                "origin": {"label": request.origin.label, "lat": request.origin.lat, "lon": request.origin.lon},
                "destination": {"label": request.destination.label, "lat": request.destination.lat, "lon": request.destination.lon},
                "departure_utc": request.departure_utc.isoformat(),
                "origin_tz": request.origin_tz,
                "load_lb": request.load_lb,
                "sampling": {"mode": request.sampling.mode, "interval_mi": request.sampling.interval_mi},
            },
            "recommendation": {
                "winner_route_id": rec.winner_route_id,
                "blocked": rec.blocked,
                "summary": rec.summary,
                "reasons": [
                    {
                        "tier": r.tier,
                        "values": r.values,
                        "kept": r.kept,
                        "decisive": r.decisive,
                    }
                    for r in rec.reasons
                ],
                "advice": rec.advice,
            },
            "routes": [self._serialize_route(er) for er in evaluated_routes],
        }

    def _serialize_route(self, er: EvaluatedRoute) -> Dict[str, Any]:
        r = er.route
        m = er.metrics
        cps_data = []
        for ec in er.checkpoints:
            cp = ec.checkpoint
            wx = ec.weather
            rk = ec.risk
            cps_data.append({
                "index": cp.index,
                "dist_mi": cp.dist_mi,
                "dist_m": cp.dist_m,
                "lat": cp.lat,
                "lon": cp.lon,
                "eta_utc": cp.eta_utc.isoformat(),
                "tz": cp.tz,
                "cell": cp.cell,
                "owned_mi": cp.owned_mi,
                "weather": {
                    "wind_mph": wx.wind_mph,
                    "gust_mph": wx.gust_mph,
                    "rain_in_hr": wx.rain_in_hr,
                    "snow_in_hr": wx.snow_in_hr,
                    "weather_code": wx.weather_code,
                    "quality": wx.quality,
                    "forecast_hour_used": wx.forecast_hour_used.isoformat(),
                },
                "risk": {
                    "overall": rk.overall.name,
                    "dominant": rk.dominant,
                    "continuous_index": rk.continuous_index,
                    "levels": {k: v.name for k, v in rk.levels.items()},
                    "load_rule_applied": rk.load_rule_applied,
                },
            })

        return {
            "id": r.id,
            "label": r.label,
            "distance_mi": m.distance_mi,
            "duration_s": m.duration_s,
            "geometry": r.display_geometry,
            "metrics": {
                "severe_mi": m.severe_mi,
                "high_mi": m.high_mi,
                "moderate_mi": m.moderate_mi,
                "low_mi": m.low_mi,
                "no_travel_mi": m.no_travel_mi,
                "avg_risk": m.avg_risk,
                "max_level": m.max_level.name,
                "worst_checkpoint_index": m.worst_checkpoint_index,
                "hours_at_high_or_worse": m.hours_at_high_or_worse,
            },
            "gradient": m.gradient,
            "checkpoints": cps_data,
        }
