import pytest
from datetime import datetime, timezone
from app.domain.models import RiskLevel, WeatherSample
from app.domain.risk import classify_checkpoint


@pytest.mark.parametrize(
    "case_id, wind_mph, rain_in_hr, snow_in_hr, load_lb, expected_level, expected_dominant",
    [
        (1, 24.9, 0.0, 0.0, 10000, RiskLevel.LOW, None),
        (2, 25.0, 0.0, 0.0, 10000, RiskLevel.MODERATE, "wind"),
        (3, 34.96, 0.0, 0.0, 10000, RiskLevel.HIGH, "wind"),  # rounds to 35.0
        (4, 35.0, 0.0, 0.0, 40000, RiskLevel.HIGH, "wind"),  # > 40000 required
        (5, 35.0, 0.0, 0.0, 40001, RiskLevel.SEVERE, "wind"),  # load rule escalates
        (6, 45.0, 0.0, 0.0, 30000, RiskLevel.SEVERE, "wind"),  # > 30000 required
        (7, 45.0, 0.0, 0.0, 30001, RiskLevel.NO_TRAVEL, "wind"),  # load rule escalates
        (8, 54.9, 0.0, 0.0, 50000, RiskLevel.NO_TRAVEL, "wind"),
        (9, 55.0, 0.0, 0.0, 5000, RiskLevel.NO_TRAVEL, "wind"),  # any load
        (10, 0.0, 0.09, 0.0, 10000, RiskLevel.LOW, None),
        (11, 0.0, 0.25, 0.0, 10000, RiskLevel.HIGH, "rain"),  # shared edge, more severe wins
        (12, 0.0, 1.00, 0.0, 10000, RiskLevel.SEVERE, "rain"),
        (13, 0.0, 1.01, 0.0, 10000, RiskLevel.NO_TRAVEL, "rain"),
        (14, 0.0, 0.0, 2.0, 10000, RiskLevel.SEVERE, "snow"),
        (15, 0.0, 0.0, 3.0, 10000, RiskLevel.SEVERE, "snow"),
        (16, 0.0, 0.0, 3.01, 10000, RiskLevel.NO_TRAVEL, "snow"),
        (17, 20.0, 0.30, 0.6, 10000, RiskLevel.HIGH, "rain"),  # rain is dominant
        (18, 42.0, 0.0, 1.2, 42000, RiskLevel.SEVERE, "wind"),  # wind load rule beats snow High
    ],
)
def test_golden_table_risk_vectors(
    case_id, wind_mph, rain_in_hr, snow_in_hr, load_lb, expected_level, expected_dominant
):
    sample = WeatherSample(
        cell="85283473fffffff",
        wind_mph=wind_mph,
        gust_mph=wind_mph * 1.3,
        rain_in_hr=rain_in_hr,
        snow_in_hr=snow_in_hr,
        weather_code=0,
        forecast_hour_used=datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc),
    )
    result = classify_checkpoint(sample, load_lb)
    assert result.overall == expected_level, (
        f"Case {case_id} failed: expected {expected_level.name}, got {result.overall.name}"
    )
    if expected_dominant is not None:
        assert result.dominant == expected_dominant, (
            f"Case {case_id} dominant failed: expected {expected_dominant}, got {result.dominant}"
        )
