import base64
import math
from datetime import datetime, timezone
from typing import List, Dict, Set, Tuple, Any
import numpy as np
import h3
from .models import RiskLevel, RoutePath
from .risk import classify_wind, classify_rain, classify_snow, classify_checkpoint

H3_EDGE_KM = {
    4: 22.6,
    5: 8.54,
    6: 3.22,
}


def build_corridor_cells(
    routes: List[RoutePath],
    half_width_mi: float = 20.0,
    h3_res: int = 5,
    max_cells: int = 400,
) -> List[str]:
    """
    Builds the H3 hexagon corridor along all routes.
    Samples along each route, fills gaps, expands by k rings, and clamps to max_cells.
    """
    edge_km = H3_EDGE_KM.get(h3_res, 8.5)
    half_width_km = half_width_mi * 1.60934
    k_rings = max(1, int(math.ceil(half_width_km / (1.732 * edge_km))))

    seed_cells: Set[str] = set()
    for route in routes:
        # Sample points along route
        for lat, lon in zip(route.lat[::5], route.lon[::5]):
            c = h3.latlng_to_cell(lat, lon, h3_res)
            seed_cells.add(c)
        if route.lat:
            seed_cells.add(h3.latlng_to_cell(route.lat[-1], route.lon[-1], h3_res))

    expanded_cells: Set[str] = set()
    for sc in seed_cells:
        for n_cell in h3.grid_disk(sc, k_rings):
            expanded_cells.add(n_cell)

    # If exceeding max_cells, shrink ring count then sample
    cell_list = list(expanded_cells)
    if len(cell_list) > max_cells:
        # Retry with smaller ring
        if k_rings > 1:
            k_rings -= 1
            expanded_cells = set()
            for sc in seed_cells:
                for n_cell in h3.grid_disk(sc, k_rings):
                    expanded_cells.add(n_cell)
            cell_list = list(expanded_cells)

    if len(cell_list) > max_cells:
        # Subsample sorted to be deterministic
        cell_list = sorted(cell_list)[:max_cells]

    return sorted(cell_list)


def build_heatmap_matrix(
    cells: List[str],
    weather_series_by_cell: Dict[str, Any],  # maps cell to time-indexed weather series
    t0_utc: datetime,
    load_lb: int,
    hours_count: int = 49,
) -> Dict[str, Any]:
    """
    Computes 49 hourly frames for all corridor cells.
    Returns compact byte matrices (base64 encoded uint8) for 60 fps client-side scrubbing.
    Intensity scaled 0..240 (where 0=Low, 60=Moderate, 120=High, 180=Severe, 240=No Travel).
    255 = No Data.
    """
    num_cells = len(cells)
    total_elements = num_cells * hours_count

    overall_bytes = bytearray(total_elements)
    wind_bytes = bytearray(total_elements)
    rain_bytes = bytearray(total_elements)
    snow_bytes = bytearray(total_elements)
    class_bytes = bytearray(total_elements)  # 0..4

    t0_ts = int(t0_utc.timestamp())

    for cell_idx, cell in enumerate(cells):
        series = weather_series_by_cell.get(cell)
        for h in range(hours_count):
            t_curr = t0_ts + h * 3600
            idx = cell_idx * hours_count + h

            if not series:
                overall_bytes[idx] = 255
                wind_bytes[idx] = 255
                rain_bytes[idx] = 255
                snow_bytes[idx] = 255
                class_bytes[idx] = 255
                continue

            w_mph = series.get_wind_at(t_curr)
            r_in = series.get_rain_at(t_curr)
            s_in = series.get_snow_at(t_curr)

            w_lvl, _, w_intensity = classify_wind(w_mph, load_lb)
            r_lvl, r_intensity = classify_rain(r_in)
            s_lvl, s_intensity = classify_snow(s_in)

            ovr_lvl = max(w_lvl, r_lvl, s_lvl)
            ovr_intensity = max(w_intensity, r_intensity, s_intensity, float(ovr_lvl))

            # Scale 0.0-4.0 continuous index to 0-240 byte value
            wind_bytes[idx] = min(240, int(round(w_intensity * 60.0)))
            rain_bytes[idx] = min(240, int(round(r_intensity * 60.0)))
            snow_bytes[idx] = min(240, int(round(s_intensity * 60.0)))
            overall_bytes[idx] = min(240, int(round(ovr_intensity * 60.0)))
            class_bytes[idx] = int(ovr_lvl)

    return {
        "meta": {
            "t0_utc": t0_utc.isoformat(),
            "step_s": 3600,
            "hours": hours_count,
            "cell_count": num_cells,
            "load_lb": load_lb,
        },
        "cells": cells,
        "layers": {
            "overall": base64.b64encode(overall_bytes).decode("ascii"),
            "wind": base64.b64encode(wind_bytes).decode("ascii"),
            "rain": base64.b64encode(rain_bytes).decode("ascii"),
            "snow": base64.b64encode(snow_bytes).decode("ascii"),
            "classes": base64.b64encode(class_bytes).decode("ascii"),
        },
    }
