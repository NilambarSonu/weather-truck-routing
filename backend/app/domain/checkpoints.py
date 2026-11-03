import math
from datetime import datetime
from typing import List, Optional
import h3
from timezonefinder import TimezoneFinder
from .models import Checkpoint, SamplingConfig
from .geometry import point_at_distance, METERS_PER_MILE
from .timecurve import TimeCurve

tf = TimezoneFinder()


def determine_sampling_interval(distance_mi: float, sampling: SamplingConfig) -> float:
    """Calculates sampling interval in miles based on mode and total distance."""
    if sampling.mode == "fixed" and sampling.interval_mi in (10.0, 25.0, 50.0):
        return sampling.interval_mi
    # Auto policy
    if distance_mi <= 250.0:
        return 10.0
    elif distance_mi <= 800.0:
        return 25.0
    else:
        return 50.0


def compute_checkpoint_distances(total_mi: float, interval_mi: float) -> List[float]:
    """
    Computes ascending checkpoint mileage distances.
    Includes origin (0.0) and destination (total_mi).
    Avoids trailing sliver if last step is < 0.35 * interval_mi.
    """
    if total_mi <= 0.0:
        return [0.0]

    s = interval_mi
    steps = [0.0]
    k = 1
    while k * s < total_mi:
        steps.append(round(k * s, 3))
        k += 1

    if len(steps) > 2 and (total_mi - steps[-1]) < 0.35 * s:
        steps.pop()

    if total_mi > steps[-1]:
        steps.append(round(total_mi, 3))

    return steps


def build_checkpoints(
    lats: List[float],
    lons: List[float],
    cum_m: List[float],
    total_distance_m: float,
    time_curve: TimeCurve,
    departure_utc: datetime,
    sampling: SamplingConfig,
    h3_res: int = 5,
    use_hos: bool = False,
) -> List[Checkpoint]:
    """
    Places checkpoints along route with ETA, H3 cell, timezone, and half-interval ownership.
    Ensures invariant: sum(owned_mi) == total_distance_mi.
    """
    total_mi = total_distance_m / METERS_PER_MILE
    step_mi = determine_sampling_interval(total_mi, sampling)
    dists_mi = compute_checkpoint_distances(total_mi, step_mi)
    n = len(dists_mi)

    checkpoints: List[Checkpoint] = []
    for i, d_mi in enumerate(dists_mi):
        d_m = min(total_distance_m, d_mi * METERS_PER_MILE)
        lat, lon = point_at_distance(lats, lons, cum_m, d_m)
        eta_utc = time_curve.eta_at(d_m, departure_utc, use_hos=use_hos)

        # Half-interval ownership
        lo_mi = 0.0 if i == 0 else (dists_mi[i - 1] + dists_mi[i]) / 2.0
        hi_mi = total_mi if i == n - 1 else (dists_mi[i] + dists_mi[i + 1]) / 2.0
        owned_mi = hi_mi - lo_mi

        lo_m = lo_mi * METERS_PER_MILE
        hi_m = hi_mi * METERS_PER_MILE

        cell = h3.latlng_to_cell(lat, lon, h3_res)
        tz_name = tf.timezone_at(lng=lon, lat=lat) or "UTC"

        checkpoints.append(
            Checkpoint(
                index=i,
                dist_m=round(d_m, 1),
                dist_mi=round(d_mi, 2),
                lat=round(lat, 6),
                lon=round(lon, 6),
                eta_utc=eta_utc,
                tz=tz_name,
                cell=cell,
                owned_lo_m=round(lo_m, 1),
                owned_hi_m=round(hi_m, 1),
                owned_mi=round(owned_mi, 3),
            )
        )

    # Enforce sum(owned_mi) == total_mi exactly to absorb any float drift
    if checkpoints:
        total_owned = sum(cp.owned_mi for cp in checkpoints)
        diff = total_mi - total_owned
        checkpoints[-1].owned_mi = round(checkpoints[-1].owned_mi + diff, 3)

    return checkpoints
