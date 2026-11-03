import math
from typing import List, Tuple, Set
import numpy as np
import polyline

EARTH_RADIUS_M = 6371008.8
METERS_PER_MILE = 1609.344


def haversine_np(lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    """Vectorized haversine distance in meters."""
    phi1 = np.radians(lat1)
    phi2 = np.radians(lat2)
    delta_phi = np.radians(lat2 - lat1)
    delta_lambda = np.radians(lon2 - lon1)

    a = np.sin(delta_phi / 2.0) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a))
    return EARTH_RADIUS_M * c


def haversine_point(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two points in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_M * c


def decode_geometry(encoded_str: str) -> Tuple[List[float], List[float]]:
    """Decodes polyline (precision 5 or 6) into lat, lon lists."""
    try:
        pts = polyline.decode(encoded_str, 6)
    except Exception:
        pts = polyline.decode(encoded_str, 5)
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    return drop_consecutive_duplicates(lats, lons)


def encode_geometry(lats: List[float], lons: List[float], precision: int = 6) -> str:
    """Encodes lat, lon lists into polyline string."""
    pts = list(zip(lats, lons))
    return polyline.encode(pts, precision)


def drop_consecutive_duplicates(lats: List[float], lons: List[float]) -> Tuple[List[float], List[float]]:
    """Removes identical adjacent points to prevent divide-by-zero."""
    if not lats:
        return [], []
    clean_lats = [lats[0]]
    clean_lons = [lons[0]]
    for i in range(1, len(lats)):
        if abs(lats[i] - clean_lats[-1]) > 1e-7 or abs(lons[i] - clean_lons[-1]) > 1e-7:
            clean_lats.append(lats[i])
            clean_lons.append(lons[i])
    return clean_lats, clean_lons


def build_cumulative_distances(lats: List[float], lons: List[float], provider_distance_m: float) -> List[float]:
    """
    Computes cumulative distance in meters along the polyline.
    Reconciles to provider_distance_m (~0.1%).
    """
    n = len(lats)
    if n <= 1:
        return [0.0] * n

    lat_np = np.array(lats, dtype=np.float64)
    lon_np = np.array(lons, dtype=np.float64)

    seg_m = haversine_np(lat_np[:-1], lon_np[:-1], lat_np[1:], lon_np[1:])
    cum_m = np.concatenate(([0.0], np.cumsum(seg_m)))

    total_calc = cum_m[-1]
    if total_calc > 0 and provider_distance_m > 0:
        cum_m = cum_m * (provider_distance_m / total_calc)

    return cum_m.tolist()


def point_at_distance(lats: List[float], lons: List[float], cum_m: List[float], target_m: float) -> Tuple[float, float]:
    """Interpolates (lat, lon) at target_m along the polyline."""
    n = len(lats)
    if n == 0:
        return 0.0, 0.0
    if n == 1 or target_m <= 0.0:
        return lats[0], lons[0]
    if target_m >= cum_m[-1]:
        return lats[-1], lons[-1]

    cum_arr = np.array(cum_m, dtype=np.float64)
    idx = int(np.searchsorted(cum_arr, target_m, side="right") - 1)
    idx = max(0, min(idx, n - 2))

    seg_len = cum_arr[idx + 1] - cum_arr[idx]
    if seg_len <= 1e-6:
        return lats[idx], lons[idx]

    f = (target_m - cum_arr[idx]) / seg_len
    lat = lats[idx] + f * (lats[idx + 1] - lats[idx])
    lon = lons[idx] + f * (lons[idx + 1] - lons[idx])
    return float(lat), float(lon)


def bearing_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing in radians from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    return math.atan2(y, x)


def offset_point(lat: float, lon: float, distance_m: float, bearing_rad: float) -> Tuple[float, float]:
    """Calculates destination point given start point, distance, and bearing."""
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)
    angular_dist = distance_m / EARTH_RADIUS_M

    phi2 = math.asin(
        math.sin(phi1) * math.cos(angular_dist) +
        math.cos(phi1) * math.sin(angular_dist) * math.cos(bearing_rad)
    )
    lambda2 = lambda1 + math.atan2(
        math.sin(bearing_rad) * math.sin(angular_dist) * math.cos(phi1),
        math.cos(angular_dist) - math.sin(phi1) * math.sin(phi2)
    )
    return math.degrees(phi2), (math.degrees(lambda2) + 540) % 360 - 180


def perpendicular_points(
    lats: List[float],
    lons: List[float],
    cum_m: List[float],
    fractions: Tuple[float, ...] = (0.35, 0.50, 0.65),
    offset_m: float = 40000.0,
) -> List[Tuple[float, float]]:
    """
    Generates perpendicular via-points (left and right) at given fractions along the route.
    Used for route diversification fallback.
    """
    total_m = cum_m[-1]
    vias: List[Tuple[float, float]] = []
    for frac in fractions:
        target_m = frac * total_m
        lat, lon = point_at_distance(lats, lons, cum_m, target_m)
        # Find forward point for bearing
        fwd_m = min(total_m, target_m + 500.0)
        fwd_lat, fwd_lon = point_at_distance(lats, lons, cum_m, fwd_m)
        brg = bearing_between(lat, lon, fwd_lat, fwd_lon)

        # Left perpendicular (-90 deg) and Right perpendicular (+90 deg)
        left_pt = offset_point(lat, lon, offset_m, brg - math.pi / 2)
        right_pt = offset_point(lat, lon, offset_m, brg + math.pi / 2)
        vias.append(left_pt)
        vias.append(right_pt)
    return vias


def grid_cells(lats: List[float], lons: List[float], grid_deg: float = 0.005) -> Set[Tuple[int, int]]:
    """Densifies and hashes coordinates to a grid for overlap calculation."""
    cells: Set[Tuple[int, int]] = set()
    for lat, lon in zip(lats, lons):
        r_lat = int(round(lat / grid_deg))
        r_lon = int(round(lon / grid_deg))
        cells.add((r_lat, r_lon))
    return cells


def compute_overlap(cells_a: Set[Tuple[int, int]], cells_b: Set[Tuple[int, int]]) -> float:
    """Shared fraction of the SHORTER route."""
    if not cells_a or not cells_b:
        return 0.0
    shared = len(cells_a & cells_b)
    return shared / min(len(cells_a), len(cells_b))
