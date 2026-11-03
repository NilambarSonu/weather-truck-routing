import asyncio
import logging
import uuid
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from .serializers import TripPlanRequestSerializer
from app.services.orchestrator import PlanOrchestrator
from app.services.heatmap_service import HeatmapService
from app.persistence.models import TripPlan

logger = logging.getLogger(__name__)


def run_async(coro):
    """Safely runs async coroutine within sync or running event loop."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return loop.run_until_complete(coro)


class GeocodeView(APIView):
    """
    GET /api/v1/geocode?q=query&limit=5
    Place autocomplete and suggestions for trucking origins/destinations.
    """

    @extend_schema(description="Place autocomplete suggestions")
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        limit = min(10, max(1, int(request.query_params.get("limit", 5))))
        orchestrator = PlanOrchestrator()
        results = run_async(orchestrator.geocode_provider.suggest(q, limit=limit))
        return Response(results)


class PlansView(APIView):
    """
    POST /api/v1/plans
    Creates a new Weather-Aware Trip Plan: generates 3 routes, samples ETA-aligned weather,
    calculates risk with load rules, computes mile-weighted metrics, and determines recommendation.
    """

    @extend_schema(
        request=TripPlanRequestSerializer,
        description="Creates an ETA-aware weather-evaluated truck route plan",
    )
    def post(self, request):
        serializer = TripPlanRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "type": "https://api.spotter.ai/errors/validation-error",
                    "title": "Validation Error",
                    "status": 400,
                    "detail": "Invalid trip plan request parameters.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        trip_req = serializer.to_domain()
        orchestrator = PlanOrchestrator()

        try:
            plan_data = run_async(orchestrator.create_plan(trip_req))
            plan_id = str(uuid.uuid4())
            plan_data["id"] = plan_id

            # Save snapshot to database
            self._save_plan_snapshot(plan_id, plan_data)

            response = Response(plan_data, status=status.HTTP_201_CREATED)

            # Set Server-Timing header for observability
            st = plan_data.get("meta", {}).get("server_timing", {})
            timing_parts = [
                f"total;dur={st.get('total_ms', 0)}",
                f"routes;dur={st.get('routing_ms', 0)}",
                f"wx;dur={st.get('weather_ms', 0)}",
            ]
            response["Server-Timing"] = ", ".join(timing_parts)
            return response

        except ValueError as ve:
            return Response(
                {
                    "type": "https://api.spotter.ai/errors/no-route",
                    "title": "No Route",
                    "status": 422,
                    "detail": str(ve),
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except Exception as e:
            logger.exception("Error creating plan")
            return Response(
                {
                    "type": "https://api.spotter.ai/errors/server-error",
                    "title": "Internal Server Error",
                    "status": 500,
                    "detail": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _save_plan_snapshot(self, plan_id: str, plan_data: dict):
        try:
            TripPlan.objects.create(
                id=uuid.UUID(plan_id),
                algo_version=plan_data.get("meta", {}).get("algo_version", "1.0.0"),
                weather_provider=plan_data.get("meta", {}).get("weather_provider", "openmeteo"),
                request_data=plan_data.get("request", {}),
                result_data=plan_data,
            )
        except Exception as e:
            logger.warning(f"Could not persist snapshot to database: {e}")


class PlanDetailView(APIView):
    """
    GET /api/v1/plans/{id}
    Retrieves immutable snapshot of a previously computed plan for sharing and review.
    """

    def get(self, request, plan_id):
        plan_dict = self._get_plan(plan_id)
        if not plan_dict:
            return Response(
                {
                    "type": "https://api.spotter.ai/errors/not-found",
                    "title": "Plan Not Found",
                    "status": 404,
                    "detail": f"Trip plan with ID {plan_id} was not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(plan_dict)

    def _get_plan(self, plan_id: str):
        try:
            uid = uuid.UUID(plan_id)
            record = TripPlan.objects.get(id=uid)
            res = dict(record.result_data)
            res["id"] = str(record.id)
            return res
        except Exception:
            return None


class HeatmapView(APIView):
    """
    GET /api/v1/plans/{id}/heatmap
    Precomputed 49-hour weather forecast frames for the entire trip corridor.
    Returned as compact base64 uint8 matrices for zero-network 60 fps time scrubbing.
    """

    def get(self, request, plan_id):
        plan_dict = self._get_plan(plan_id)
        if not plan_dict:
            return Response(
                {"detail": f"Trip plan {plan_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        heatmap_svc = HeatmapService()
        try:
            matrix = run_async(heatmap_svc.generate_heatmap(plan_dict))
            resp = Response(matrix)
            resp["Cache-Control"] = "private, max-age=900"
            return resp
        except Exception as e:
            logger.exception("Error generating heatmap")
            return Response(
                {"detail": f"Failed to generate heatmap: {e}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _get_plan(self, plan_id: str):
        try:
            uid = uuid.UUID(plan_id)
            record = TripPlan.objects.get(id=uid)
            return record.result_data
        except Exception:
            return None


class HealthView(APIView):
    """
    GET /api/v1/health
    Liveness and operational readiness check.
    """

    def get(self, request):
        import os
        return Response({
            "status": "healthy",
            "service": "weather-truck-routing",
            "version": "1.0.0",
            "environment": os.getenv("DJANGO_ENV", "production"),
            "providers": {
                "routing": "tomtom" if os.getenv("TOMTOM_API_KEY") else "demo_fixture",
                "weather": os.getenv("WEATHER_PROVIDER", "openmeteo"),
                "geocoding": "tomtom" if os.getenv("TOMTOM_API_KEY") else "photon_osm",
            },
        })
