from typing import List, Dict, Optional, Tuple, Any
from .models import (
    EvaluatedRoute,
    Recommendation,
    Reason,
)


class RankingConfig:
    def __init__(
        self,
        mode: str = "tolerant",  # "tolerant" | "strict"
        eps_severe: Optional[float] = None,
        eps_high: Optional[float] = None,
        eps_avg: float = 0.05,
    ):
        self.mode = mode
        self.eps_severe = eps_severe
        self.eps_high = eps_high
        self.eps_avg = eps_avg


def recommend_route(
    routes: List[EvaluatedRoute],
    config: Optional[RankingConfig] = None,
) -> Recommendation:
    """
    Tolerance-banded lexicographic route recommendation:
    1. Fewest Severe miles
    2. Fewest High miles
    3. Lowest average risk
    4. Shortest travel time

    Handles No Travel as a hard block.
    Generates human-readable explanations.
    """
    if not routes:
        return Recommendation(
            winner_route_id=None,
            blocked=True,
            reasons=[],
            summary="No routes available to evaluate.",
        )

    cfg = config or RankingConfig()

    # Step 1: Hard block check for No Travel
    allowed = [r for r in routes if r.metrics.no_travel_mi == 0.0]

    if not allowed:
        # All routes blocked
        least_blocked = min(routes, key=lambda r: r.metrics.no_travel_mi)
        return Recommendation(
            winner_route_id=None,
            blocked=True,
            reasons=[],
            summary=(
                f"All {len(routes)} route options are blocked due to Severe/No-Travel conditions. "
                f"Delay departure recommended. Lowest blocked route has {least_blocked.metrics.no_travel_mi:.1f} No-Travel miles."
            ),
            advice={
                "all_blocked": True,
                "lowest_no_travel_route_id": least_blocked.route.id,
                "suggested_action": "delay_departure",
            },
        )

    # Compute tolerances based on route length
    max_route_mi = max(r.metrics.distance_mi for r in routes)
    if cfg.mode == "strict":
        eps_severe = 0.0
        eps_high = 0.0
        eps_avg = 0.0
    else:
        eps_severe = cfg.eps_severe if cfg.eps_severe is not None else max(2.0, 0.015 * max_route_mi)
        eps_high = cfg.eps_high if cfg.eps_high is not None else max(5.0, 0.03 * max_route_mi)
        eps_avg = cfg.eps_avg

    pool = list(allowed)
    reasons: List[Reason] = []

    # Tier 1: Severe miles
    severe_vals = {r.route.id: r.metrics.severe_mi for r in routes}
    best_severe = min(r.metrics.severe_mi for r in pool)
    new_pool = [r for r in pool if r.metrics.severe_mi <= best_severe + eps_severe]
    decisive_1 = len(new_pool) < len(pool) and len(new_pool) == 1
    reasons.append(
        Reason(
            tier="severe_mi",
            values=severe_vals,
            kept=[r.route.id for r in new_pool],
            decisive=decisive_1,
        )
    )
    pool = new_pool

    # Tier 2: High miles
    if len(pool) > 1:
        high_vals = {r.route.id: r.metrics.high_mi for r in routes}
        best_high = min(r.metrics.high_mi for r in pool)
        new_pool = [r for r in pool if r.metrics.high_mi <= best_high + eps_high]
        decisive_2 = len(new_pool) < len(pool) and len(new_pool) == 1
        reasons.append(
            Reason(
                tier="high_mi",
                values=high_vals,
                kept=[r.route.id for r in new_pool],
                decisive=decisive_2,
            )
        )
        pool = new_pool

    # Tier 3: Average risk
    if len(pool) > 1:
        avg_vals = {r.route.id: r.metrics.avg_risk for r in routes}
        best_avg = min(r.metrics.avg_risk for r in pool)
        new_pool = [r for r in pool if r.metrics.avg_risk <= best_avg + eps_avg]
        decisive_3 = len(new_pool) < len(pool) and len(new_pool) == 1
        reasons.append(
            Reason(
                tier="avg_risk",
                values=avg_vals,
                kept=[r.route.id for r in new_pool],
                decisive=decisive_3,
            )
        )
        pool = new_pool

    # Tier 4: Travel time
    winner = min(pool, key=lambda r: (r.metrics.duration_s, r.metrics.avg_risk))

    # Generate clear human-readable summary
    summary = generate_recommendation_summary(winner, routes, reasons)

    return Recommendation(
        winner_route_id=winner.route.id,
        blocked=False,
        reasons=reasons,
        summary=summary,
        advice=None,
    )


def generate_recommendation_summary(
    winner: EvaluatedRoute,
    all_routes: List[EvaluatedRoute],
    reasons: List[Reason],
) -> str:
    """Produces crisp explanation of the winning route."""
    fastest = min(all_routes, key=lambda r: r.metrics.duration_s)
    w_metrics = winner.metrics
    w_label = winner.route.label or f"Route {winner.route.id}"

    if winner.route.id == fastest.route.id:
        if w_metrics.severe_mi == 0 and w_metrics.high_mi == 0:
            return f"{w_label} is recommended: it is the fastest route with zero Severe or High weather risk miles."
        else:
            return (
                f"{w_label} is recommended: it provides the shortest travel time ({w_metrics.duration_s // 3600}h {(w_metrics.duration_s % 3600) // 60}m) "
                f"while maintaining equivalent or superior weather risk."
            )

    time_diff_min = int(round((w_metrics.duration_s - fastest.metrics.duration_s) / 60.0))
    severe_avoided = fastest.metrics.severe_mi - w_metrics.severe_mi
    high_avoided = fastest.metrics.high_mi - w_metrics.high_mi

    reasons_text = []
    if severe_avoided > 0:
        reasons_text.append(f"avoids {severe_avoided:.1f} Severe risk miles")
    if high_avoided > 0:
        reasons_text.append(f"avoids {high_avoided:.1f} High risk miles")

    if not reasons_text:
        reasons_text.append("provides lower overall average weather risk")

    return (
        f"{w_label} is recommended: {' and '.join(reasons_text)} compared to the fastest option "
        f"for an additional {time_diff_min} min travel time."
    )
