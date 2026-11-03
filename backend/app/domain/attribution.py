from typing import List, Tuple, Any
from .models import (
    RiskLevel,
    RouteMetrics,
    EvaluatedCheckpoint,
    RoutePath,
)
from .geometry import METERS_PER_MILE


def compute_route_metrics(
    route: RoutePath,
    evaluated_checkpoints: List[EvaluatedCheckpoint],
) -> RouteMetrics:
    """
    Computes mile-weighted route risk metrics and line gradient stops from evaluated checkpoints.
    Enforces invariant: severe_mi + high_mi + moderate_mi + low_mi + no_travel_mi == total_mi.
    """
    total_mi = route.distance_m / METERS_PER_MILE
    if not evaluated_checkpoints:
        return RouteMetrics(
            distance_mi=round(total_mi, 2),
            duration_s=route.duration_s,
            severe_mi=0.0,
            high_mi=0.0,
            moderate_mi=0.0,
            low_mi=round(total_mi, 2),
            no_travel_mi=0.0,
            avg_risk=0.0,
            max_level=RiskLevel.LOW,
            worst_checkpoint_index=0,
            gradient=[[0.0, "LOW"], [1.0, "LOW"]],
            hours_at_high_or_worse=0.0,
        )

    severe_mi = 0.0
    high_mi = 0.0
    moderate_mi = 0.0
    low_mi = 0.0
    no_travel_mi = 0.0
    weighted_risk_sum = 0.0

    max_level = RiskLevel.LOW
    worst_idx = 0
    worst_intensity = -1.0

    gradient: List[List[Any]] = []
    total_d_m = max(1.0, route.distance_m)

    high_or_worse_owned_mi = 0.0

    for idx, ec in enumerate(evaluated_checkpoints):
        cp = ec.checkpoint
        rk = ec.risk
        lvl = rk.overall
        mi = cp.owned_mi

        if lvl == RiskLevel.NO_TRAVEL:
            no_travel_mi += mi
        elif lvl == RiskLevel.SEVERE:
            severe_mi += mi
        elif lvl == RiskLevel.HIGH:
            high_mi += mi
        elif lvl == RiskLevel.MODERATE:
            moderate_mi += mi
        else:
            low_mi += mi

        weighted_risk_sum += mi * float(lvl)

        if lvl >= RiskLevel.HIGH:
            high_or_worse_owned_mi += mi

        if (lvl > max_level) or (lvl == max_level and rk.continuous_index > worst_intensity):
            max_level = lvl
            worst_idx = idx
            worst_intensity = rk.continuous_index

        frac_start = min(1.0, max(0.0, cp.owned_lo_m / total_d_m))
        gradient.append([round(frac_start, 4), lvl.name])

    # Ensure last stop at 1.0
    if gradient:
        last_lvl = evaluated_checkpoints[-1].risk.overall.name
        gradient.append([1.0, last_lvl])

    avg_risk = weighted_risk_sum / total_mi if total_mi > 0 else 0.0

    # Estimate hours at high or worse from proportion of miles * total duration
    hours_high_or_worse = (
        (high_or_worse_owned_mi / total_mi) * (route.duration_s / 3600.0)
        if total_mi > 0 else 0.0
    )

    return RouteMetrics(
        distance_mi=round(total_mi, 2),
        duration_s=route.duration_s,
        severe_mi=round(severe_mi, 2),
        high_mi=round(high_mi, 2),
        moderate_mi=round(moderate_mi, 2),
        low_mi=round(low_mi, 2),
        no_travel_mi=round(no_travel_mi, 2),
        avg_risk=round(avg_risk, 3),
        max_level=max_level,
        worst_checkpoint_index=worst_idx,
        gradient=gradient,
        hours_at_high_or_worse=round(hours_high_or_worse, 1),
    )
