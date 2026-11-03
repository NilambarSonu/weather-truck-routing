from django.urls import path
from .views import (
    GeocodeView,
    PlansView,
    PlanDetailView,
    HeatmapView,
    HealthView,
)

urlpatterns = [
    path("geocode", GeocodeView.as_view(), name="geocode"),
    path("plans", PlansView.as_view(), name="plans"),
    path("plans/<str:plan_id>", PlanDetailView.as_view(), name="plan-detail"),
    path("plans/<str:plan_id>/heatmap", HeatmapView.as_view(), name="plan-heatmap"),
    path("health", HealthView.as_view(), name="health"),
]
