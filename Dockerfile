# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend Runtime
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy compiled frontend static build
COPY --from=frontend-builder /backend/static_build ./static_build

# Run migrations and collect static files
RUN python manage.py collectstatic --noinput

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/v1/health || exit 1

CMD gunicorn config.asgi:application \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT} \
    --workers 2 \
    --timeout 120
