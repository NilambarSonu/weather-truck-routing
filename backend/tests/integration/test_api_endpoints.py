import pytest
from datetime import datetime, timezone, timedelta
from rest_framework.test import APIClient
from app.persistence.models import TripPlan


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_health_endpoint(api_client):
    response = api_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "routing" in data["providers"]
    assert "weather" in data["providers"]


@pytest.mark.django_db
def test_geocode_endpoint(api_client):
    response = api_client.get("/api/v1/geocode?q=Chicago&limit=3")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "lat" in data[0]
    assert "lon" in data[0]
    assert "label" in data[0]


@pytest.mark.django_db
def test_create_and_fetch_plan(api_client):
    # Set future departure (tomorrow 08:00)
    dep_time = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT08:00")

    payload = {
        "origin": {"label": "Chicago, IL, USA", "lat": 41.8781, "lon": -87.6298},
        "destination": {"label": "Denver, CO, USA", "lat": 39.7392, "lon": -104.9903},
        "departure_local": dep_time,
        "load_lb": 42000,
        "sampling": {"mode": "auto"},
        "options": {"ranking": "tolerant"},
    }

    response = api_client.post("/api/v1/plans", payload, format="json")
    assert response.status_code == 201
    plan_data = response.json()

    assert "id" in plan_data
    plan_id = plan_data["id"]

    # Check Server-Timing header
    assert "Server-Timing" in response.headers

    # Check 3 routes
    routes = plan_data.get("routes", [])
    assert len(routes) == 3
    for r in routes:
        assert "id" in r
        assert "distance_mi" in r
        assert "duration_s" in r
        assert "geometry" in r
        assert "metrics" in r
        assert "gradient" in r
        assert "checkpoints" in r
        assert len(r["checkpoints"]) > 5

    # Check recommendation
    rec = plan_data.get("recommendation", {})
    assert "winner_route_id" in rec
    assert rec["winner_route_id"] in ["A", "B", "C"]
    assert "summary" in rec
    assert len(rec.get("reasons", [])) > 0

    # Test GET /api/v1/plans/{id}
    fetch_resp = api_client.get(f"/api/v1/plans/{plan_id}")
    assert fetch_resp.status_code == 200
    fetched_data = fetch_resp.json()
    assert fetched_data["id"] == plan_id
    assert len(fetched_data["routes"]) == 3

    # Test GET /api/v1/plans/{id}/heatmap
    hm_resp = api_client.get(f"/api/v1/plans/{plan_id}/heatmap")
    assert hm_resp.status_code == 200
    hm_data = hm_resp.json()
    assert "meta" in hm_data
    assert "cells" in hm_data
    assert "layers" in hm_data
    assert "overall" in hm_data["layers"]
    assert "wind" in hm_data["layers"]
    assert "rain" in hm_data["layers"]
    assert "snow" in hm_data["layers"]
    assert len(hm_data["cells"]) > 0


@pytest.mark.django_db
def test_openapi_schema(api_client):
    response = api_client.get("/api/schema/")
    assert response.status_code == 200
    assert len(response.content) > 100
