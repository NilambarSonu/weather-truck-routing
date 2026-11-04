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

from django.views.static import serve

# Assets and SPA handlers
BASE_DIR = Path(__file__).resolve().parent.parent
SPA_CANDIDATES = [
    BASE_DIR / "static_build" / "index.html",
    BASE_DIR / "staticfiles" / "index.html",
    BASE_DIR.parent / "dist" / "index.html",
    BASE_DIR.parent / "frontend" / "dist" / "index.html",
]

ASSETS_DIRS = [
    BASE_DIR / "static_build" / "assets",
    BASE_DIR / "staticfiles" / "assets",
    BASE_DIR.parent / "dist" / "assets",
    BASE_DIR.parent / "frontend" / "dist" / "assets",
]


def serve_asset(request, path):
    for adir in ASSETS_DIRS:
        if (adir / path).exists():
            return serve(request, path, document_root=adir)
    return HttpResponse(status=404)


def serve_spa(request):
    for candidate in SPA_CANDIDATES:
        if candidate.exists():
            return FileResponse(open(candidate, "rb"))
    return HttpResponse(
        "<h1>Spotter Weather-Aware Truck Routing API</h1>"
        "<p>API running at <code>/api/v1/</code>. Frontend build will be served here once compiled.</p>"
        "<p>Swagger UI: <a href='/api/docs/'>/api/docs/</a></p>",
        content_type="text/html",
    )


urlpatterns.append(re_path(r"^assets/(?P<path>.*)$", serve_asset))
urlpatterns.append(re_path(r"^(?!api/|admin/|static/|assets/).*$", serve_spa))
