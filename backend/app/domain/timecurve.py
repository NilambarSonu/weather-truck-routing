from datetime import datetime, timedelta, timezone
from typing import List, Tuple
import numpy as np


class TimeCurve:
    """
    Cumulative time curve T(d) mapping distance in meters to driving duration in seconds.
    Ensures accurate ETAs accounting for speed variations along highways, mountain passes, and urban areas.
    """

    def __init__(
        self,
        offsets_m: List[float],
        cum_s: List[float],
        total_distance_m: float,
        total_duration_s: float,
        truck_factor: float = 1.0,
    ):
        self.total_distance_m = total_distance_m
        self.total_duration_s = total_duration_s
        self.truck_factor = truck_factor

        if offsets_m and len(offsets_m) > 1 and len(offsets_m) == len(cum_s):
            # Ensure monotone strictly ascending
            clean_offsets = [0.0]
            clean_s = [0.0]
            for off, s in zip(offsets_m, cum_s):
                if off > clean_offsets[-1]:
                    clean_offsets.append(off)
                    clean_s.append(max(clean_s[-1], s))
            if clean_offsets[-1] < total_distance_m:
                clean_offsets.append(total_distance_m)
                clean_s.append(total_duration_s)
            self.offsets_m = np.array(clean_offsets, dtype=np.float64)
            self.cum_s = np.array(clean_s, dtype=np.float64)
        else:
            # Linear fallback
            self.offsets_m = np.array([0.0, max(1.0, total_distance_m)], dtype=np.float64)
            self.cum_s = np.array([0.0, max(1.0, total_duration_s)], dtype=np.float64)

    def drive_seconds_at(self, dist_m: float) -> float:
        """Interpolates driving time in seconds at distance dist_m."""
        if dist_m <= 0:
            return 0.0
        if dist_m >= self.total_distance_m:
            return self.total_duration_s * self.truck_factor

        s = float(np.interp(dist_m, self.offsets_m, self.cum_s))
        return s * self.truck_factor

    def eta_at(self, dist_m: float, departure_utc: datetime, use_hos: bool = False) -> datetime:
        """Returns UTC ETA at distance dist_m."""
        drive_s = self.drive_seconds_at(dist_m)
        clock_s = drive_s
        if use_hos:
            clock_s = apply_hos_clock(drive_s)
        return departure_utc + timedelta(seconds=clock_s)


def apply_hos_clock(drive_s: float) -> float:
    """
    State machine converting driving time into clock time with US HOS rules:
    - 30-minute break after 8 driving hours
    - 10-hour reset after 11 driving hours
    """
    eight_h = 8 * 3600
    eleven_h = 11 * 3600
    break_s = 1800.0  # 30 min
    reset_s = 36000.0  # 10 hours

    clock = 0.0
    since_break = 0.0
    shift_drive = 0.0
    left = drive_s

    while left > 0.0:
        take = min(left, eight_h - since_break, eleven_h - shift_drive)
        clock += take
        since_break += take
        shift_drive += take
        left -= take

        if shift_drive >= eleven_h:
            clock += reset_s
            since_break = 0.0
            shift_drive = 0.0
        elif since_break >= eight_h:
            clock += break_s
            since_break = 0.0

    return clock
