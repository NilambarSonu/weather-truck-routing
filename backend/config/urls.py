import os
from pathlib import Path
from django.contrib import admin
from django.urls import path, include, re_path
from django.http import HttpResponse, FileResponse
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("app.api.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

# SPA fallback handler: serves frontend index.html for non-API routes
BASE_DIR = Path(__file__).resolve().parent.parent
BUILD_INDEX = BASE_DIR / "static_build" / "index.html"


def serve_spa(request):
    if BUILD_INDEX.exists():
        return FileResponse(open(BUILD_INDEX, "rb"))
    return HttpResponse(
        "<h1>Spotter Weather-Aware Truck Routing API</h1>"
        "<p>API running at <code>/api/v1/</code>. Frontend build will be served here once compiled.</p>"
        "<p>Swagger UI: <a href='/api/docs/'>/api/docs/</a></p>",
        content_type="text/html",
    )


urlpatterns.append(re_path(r"^(?!api/|admin/|static/).*$", serve_spa))
