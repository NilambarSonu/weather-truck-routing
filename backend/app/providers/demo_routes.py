import math
from datetime import datetime
from typing import List, Tuple
from app.domain.models import RoutePath, Place
from app.domain.geometry import (
    haversine_point,
    encode_geometry,
    build_cumulative_distances,
    drop_consecutive_duplicates,
    METERS_PER_MILE,
)


def interpolate_arc(
    start: Tuple[float, float],
    end: Tuple[float, float],
    num_points: int = 50,
    lateral_offset_fraction: float = 0.0,
) -> List[Tuple[float, float]]:
    """
    Interpolates a curved path between start and end coordinates with lateral bow.
    Simulates real highway corridors following natural terrain.
    """
    lat1, lon1 = start
    lat2, lon2 = end
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    chord_len = math.hypot(dlat, dlon)

    # Unit normal vector perpendicular to chord
    if chord_len > 1e-6:
        nlat = -dlon / chord_len
        nlon = dlat / chord_len
    else:
        nlat, nlon = 0.0, 0.0

    points = []
    for i in range(num_points):
        f = i / (num_points - 1)
        # Parabolic bow: 4 * f * (1 - f) peaks at 1.0 in the middle
        bow = 4.0 * f * (1.0 - f) * lateral_offset_fraction * chord_len

        # Subtle sine wave perturbation to mimic realistic highway turns
        wiggle = 0.02 * math.sin(f * math.pi * 6.0) * chord_len

        lat = lat1 + f * dlat + (bow + wiggle) * nlat
        lon = lon1 + f * dlon + (bow + wiggle) * nlon
        points.append((lat, lon))

    return points


def create_synthetic_route(
    route_id: str,
    label: str,
    origin: Place,
    dest: Place,
    lateral_offset_fraction: float,
    speed_mph: float = 62.0,
    distance_multiplier: float = 1.15,
) -> RoutePath:
    """Creates a realistic RoutePath between origin and destination."""
    direct_m = haversine_point(origin.lat, origin.lon, dest.lat, dest.lon)
    route_dist_m = direct_m * distance_multiplier

    # Build coordinates
    pts = interpolate_arc(
        (origin.lat, origin.lon),
        (dest.lat, dest.lon),
        num_points=100,
        lateral_offset_fraction=lateral_offset_fraction,
    )
    raw_lats = [p[0] for p in pts]
    raw_lons = [p[1] for p in pts]
    lats, lons = drop_consecutive_duplicates(raw_lats, raw_lons)

    cum_m = build_cumulative_distances(lats, lons, route_dist_m)
    total_dist_mi = route_dist_m / METERS_PER_MILE
    duration_s = (total_dist_mi / speed_mph) * 3600.0

    # Build step-level time curve (with realistic slight slowdowns at start/end)
    n = len(cum_m)
    offsets_m = list(cum_m)
    cum_s = []
    for m in cum_m:
        frac = m / route_dist_m if route_dist_m > 0 else 0.0
        # Smooth S-curve duration
        t_s = frac * duration_s
        cum_s.append(t_s)

    display_geom = encode_geometry(lats, lons, precision=6)

    return RoutePath(
        id=route_id,
        label=label,
        lat=lats,
        lon=lons,
        cum_m=cum_m,
        offsets_m=offsets_m,
        cum_s=cum_s,
        distance_m=route_dist_m,
        duration_s=round(duration_s, 1),
        provider_ref=f"demo_provider_{route_id.lower()}",
        display_geometry=display_geom,
    )


def get_demo_routes(origin: Place, dest: Place) -> List[RoutePath]:
    """
    Generates 3 genuinely distinct routes between any origin and destination.
    Route A: Fastest direct highway route (slight natural alignment)
    Route B: Alternative A (northern/western diversified corridor)
    Route C: Alternative B (southern/eastern diversified corridor)
    """
    # Route A: Direct corridor
    route_a = create_synthetic_route(
        route_id="A",
        label="Fastest Route (Demo)",
        origin=origin,
        dest=dest,
        lateral_offset_fraction=0.04,
        speed_mph=64.0,
        distance_multiplier=1.12,
    )

    # Route B: Northern / Western bypass corridor
    route_b = create_synthetic_route(
        route_id="B",
        label="Northern Corridor (Demo)",
        origin=origin,
        dest=dest,
        lateral_offset_fraction=-0.16,
        speed_mph=61.5,
        distance_multiplier=1.19,
    )

    # Route C: Southern / Eastern bypass corridor
    route_c = create_synthetic_route(
        route_id="C",
        label="Southern Corridor (Demo)",
        origin=origin,
        dest=dest,
        lateral_offset_fraction=0.18,
        speed_mph=59.5,
        distance_multiplier=1.23,
    )

    return [route_a, route_b, route_c]
