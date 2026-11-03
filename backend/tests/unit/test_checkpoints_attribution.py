import pytest
from datetime import datetime, timezone, timedelta
from app.domain.models import (
    RoutePath,
    RouteMetrics,
    RiskLevel,
    WeatherSample,
    EvaluatedCheckpoint,
    EvaluatedRoute,
    SamplingConfig,
)
from app.domain.checkpoints import build_checkpoints, determine_sampling_interval
from app.domain.attribution import compute_route_metrics
from app.domain.ranking import recommend_route, RankingConfig
from app.domain.risk import classify_checkpoint
from app.domain.timecurve import TimeCurve


def create_dummy_route(
    route_id: str,
    distance_mi: float = 300.0,
    duration_s: float = 18000.0,
) -> RoutePath:
    total_m = distance_mi * 1609.344
    # Points along a line
    lats = [40.0 + (i / 10.0) * 2.0 for i in range(11)]
    lons = [-80.0 + (i / 10.0) * 4.0 for i in range(11)]
    cum_m = [(i / 10.0) * total_m for i in range(11)]
    offsets_m = list(cum_m)
    cum_s = [(i / 10.0) * duration_s for i in range(11)]

    return RoutePath(
        id=route_id,
        label=f"Route {route_id}",
        lat=lats,
        lon=lons,
        cum_m=cum_m,
        offsets_m=offsets_m,
        cum_s=cum_s,
        distance_m=total_m,
        duration_s=duration_s,
        provider_ref="test",
        display_geometry="encoded_test",
    )


def test_checkpoint_owned_miles_invariant():
    """Invariant: sum of checkpoint owned miles must equal total route distance."""
    route = create_dummy_route("A", distance_mi=452.3)
    tc = TimeCurve(route.offsets_m, route.cum_s, route.distance_m, route.duration_s)
    dep_utc = datetime(2026, 11, 4, 8, 0, tzinfo=timezone.utc)

    for mode, interval in [("auto", 25.0), ("fixed", 10.0), ("fixed", 50.0)]:
        cps = build_checkpoints(
            route.lat,
            route.lon,
            route.cum_m,
            route.distance_m,
            tc,
            dep_utc,
            sampling=SamplingConfig(mode=mode, interval_mi=interval),
        )

        total_owned = sum(cp.owned_mi for cp in cps)
        expected_total = route.distance_m / 1609.344
        assert abs(total_owned - expected_total) < 1e-2, (
            f"Owned miles sum ({total_owned}) != expected route distance ({expected_total})"
        )

        # ETAs must be monotonically increasing
        for j in range(len(cps) - 1):
            assert cps[j].eta_utc <= cps[j + 1].eta_utc


def test_metric_sum_invariant():
    """Invariant: sum of miles in all risk tiers equals total route miles."""
    route = create_dummy_route("B", distance_mi=500.0)
    tc = TimeCurve(route.offsets_m, route.cum_s, route.distance_m, route.duration_s)
    dep_utc = datetime(2026, 11, 4, 8, 0, tzinfo=timezone.utc)

    cps = build_checkpoints(
        route.lat,
        route.lon,
        route.cum_m,
        route.distance_m,
        tc,
        dep_utc,
        sampling=SamplingConfig(mode="auto"),
    )

    evaluated_cps = []
    for idx, cp in enumerate(cps):
        # Vary weather across checkpoints
        wind = 20.0 + idx * 3.0  # Some low, moderate, severe
        sample = WeatherSample(
            cell=cp.cell,
            wind_mph=wind,
            gust_mph=wind * 1.2,
            rain_in_hr=0.0,
            snow_in_hr=0.0,
            weather_code=0,
            forecast_hour_used=cp.eta_utc,
        )
        rk = classify_checkpoint(sample, load_lb=45000)
        evaluated_cps.append(EvaluatedCheckpoint(checkpoint=cp, weather=sample, risk=rk))

    metrics = compute_route_metrics(route, evaluated_cps)
    sum_mi = (
        metrics.severe_mi + metrics.high_mi + metrics.moderate_mi + metrics.low_mi + metrics.no_travel_mi
    )
    assert abs(sum_mi - metrics.distance_mi) < 1e-2


def test_ranking_hierarchy_and_no_travel_block():
    """Tests the 4-tier ranking preference and hard block on No Travel."""
    rA = create_dummy_route("A", distance_mi=300.0, duration_s=18000.0)
    rB = create_dummy_route("B", distance_mi=310.0, duration_s=18600.0)
    rC = create_dummy_route("C", distance_mi=320.0, duration_s=19200.0)

    # Route A has No Travel
    ev_A = EvaluatedRoute(
        route=rA,
        checkpoints=[],
        metrics=RouteMetrics(
            distance_mi=300.0, duration_s=18000.0,
            severe_mi=0.0, high_mi=0.0, moderate_mi=0.0, low_mi=280.0, no_travel_mi=20.0,
            avg_risk=0.5, max_level=RiskLevel.NO_TRAVEL, worst_checkpoint_index=0, gradient=[],
        ),
    )

    # Route B has 0 Severe, 50 High
    ev_B = EvaluatedRoute(
        route=rB,
        checkpoints=[],
        metrics=RouteMetrics(
            distance_mi=310.0, duration_s=18600.0,
            severe_mi=0.0, high_mi=50.0, moderate_mi=0.0, low_mi=260.0, no_travel_mi=0.0,
            avg_risk=0.8, max_level=RiskLevel.HIGH, worst_checkpoint_index=0, gradient=[],
        ),
    )

    # Route C has 25 Severe
    ev_C = EvaluatedRoute(
        route=rC,
        checkpoints=[],
        metrics=RouteMetrics(
            distance_mi=320.0, duration_s=19200.0,
            severe_mi=25.0, high_mi=0.0, moderate_mi=0.0, low_mi=295.0, no_travel_mi=0.0,
            avg_risk=0.9, max_level=RiskLevel.SEVERE, worst_checkpoint_index=0, gradient=[],
        ),
    )

    # Route A is blocked, Route B wins on fewest Severe miles over C
    rec = recommend_route([ev_A, ev_B, ev_C], RankingConfig(mode="strict"))
    assert not rec.blocked
    assert rec.winner_route_id == "B"
    assert "Route B is recommended" in rec.summary
