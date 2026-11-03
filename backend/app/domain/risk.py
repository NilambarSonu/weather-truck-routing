from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Optional, Tuple
from .models import RiskLevel, WeatherSample, CheckpointRisk


def round_half_up(val: float, decimals: int) -> float:
    """Rounds float using standard half-up decimal arithmetic."""
    d = Decimal(str(val))
    target = Decimal("10") ** (-decimals)
    return float(d.quantize(target, rounding=ROUND_HALF_UP))


def classify_wind(mph: float, load_lb: int) -> Tuple[RiskLevel, Optional[str], float]:
    """
    Classifies wind speed into RiskLevel, checking load rules.
    Returns (RiskLevel, load_rule_applied_string_or_None, continuous_intensity).
    """
    rounded_mph = round_half_up(mph, 1)

    # Continuous intensity calculation
    if rounded_mph < 25.0:
        c_idx = max(0.0, rounded_mph / 25.0)
        base_level = RiskLevel.LOW
    elif rounded_mph < 35.0:
        c_idx = 1.0 + (rounded_mph - 25.0) / 10.0
        base_level = RiskLevel.MODERATE
    elif rounded_mph < 45.0:
        c_idx = 2.0 + (rounded_mph - 35.0) / 10.0
        base_level = RiskLevel.HIGH
    elif rounded_mph < 55.0:
        c_idx = 3.0 + (rounded_mph - 45.0) / 10.0
        base_level = RiskLevel.SEVERE
    else:
        c_idx = 4.0
        base_level = RiskLevel.NO_TRAVEL

    level = base_level
    rule_applied = None

    if rounded_mph >= 55.0:
        level = RiskLevel.NO_TRAVEL
        rule_applied = "Wind >= 55 mph: No Travel for any load"
    elif 45.0 <= rounded_mph < 55.0 and load_lb > 30000:
        level = RiskLevel.NO_TRAVEL
        rule_applied = f"Wind 45-54 mph with load {load_lb:,} lb (>30,000 lb): No Travel"
    elif 35.0 <= rounded_mph < 45.0 and load_lb > 40000:
        level = max(level, RiskLevel.SEVERE)
        rule_applied = f"Wind 35-44 mph with load {load_lb:,} lb (>40,000 lb): Severe"

    c_idx = max(c_idx, float(level))
    return level, rule_applied, min(4.0, c_idx)


def classify_rain(in_hr: float) -> Tuple[RiskLevel, float]:
    """
    Classifies rain in inches/hour.
    Returns (RiskLevel, continuous_intensity).
    """
    x = round_half_up(in_hr, 2)
    if x < 0.10:
        c_idx = max(0.0, x / 0.10)
        return RiskLevel.LOW, c_idx
    elif x < 0.25:
        c_idx = 1.0 + (x - 0.10) / 0.15
        return RiskLevel.MODERATE, c_idx
    elif x < 0.50:
        c_idx = 2.0 + (x - 0.25) / 0.25
        return RiskLevel.HIGH, c_idx
    elif x <= 1.00:
        c_idx = 3.0 + (x - 0.50) / 0.50
        return RiskLevel.SEVERE, c_idx
    else:
        return RiskLevel.NO_TRAVEL, 4.0


def classify_snow(in_hr: float) -> Tuple[RiskLevel, float]:
    """
    Classifies snowfall in inches/hour.
    Returns (RiskLevel, continuous_intensity).
    """
    x = round_half_up(in_hr, 2)
    if x < 0.50:
        c_idx = max(0.0, x / 0.50)
        return RiskLevel.LOW, c_idx
    elif x < 1.00:
        c_idx = 1.0 + (x - 0.50) / 0.50
        return RiskLevel.MODERATE, c_idx
    elif x < 2.00:
        c_idx = 2.0 + (x - 1.00) / 1.00
        return RiskLevel.HIGH, c_idx
    elif x <= 3.00:
        c_idx = 3.0 + (x - 2.00) / 1.00
        return RiskLevel.SEVERE, c_idx
    else:
        return RiskLevel.NO_TRAVEL, 4.0


def classify_checkpoint(sample: WeatherSample, load_lb: int) -> CheckpointRisk:
    """
    Combines wind, rain, and snow risk using worst-of-three semantics after load rules.
    Identifies dominant hazard and calculates continuous intensity index.
    """
    wind_lvl, wind_rule, wind_idx = classify_wind(sample.wind_mph, load_lb)
    rain_lvl, rain_idx = classify_rain(sample.rain_in_hr)
    snow_lvl, snow_idx = classify_snow(sample.snow_in_hr)

    levels: Dict[str, RiskLevel] = {
        "wind": wind_lvl,
        "rain": rain_lvl,
        "snow": snow_lvl,
    }

    overall = max(wind_lvl, rain_lvl, snow_lvl)
    overall_idx = max(wind_idx, rain_idx, snow_idx, float(overall))

    # Identify dominant hazard (hazard with maximum level > LOW)
    dominant: Optional[str] = None
    if overall > RiskLevel.LOW:
        # Check hazards matching the overall level
        matching = [h for h, lvl in levels.items() if lvl == overall]
        if len(matching) == 1:
            dominant = matching[0]
        else:
            # Tie breaker: choose the one with highest continuous index
            intensities = {"wind": wind_idx, "rain": rain_idx, "snow": snow_idx}
            dominant = max(matching, key=lambda h: intensities[h])

    return CheckpointRisk(
        levels=levels,
        overall=overall,
        dominant=dominant,
        continuous_index=round(overall_idx, 3),
        load_rule_applied=wind_rule,
    )
