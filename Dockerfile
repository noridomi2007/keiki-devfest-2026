FROM node:20-slim AS fe
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

# Create unprivileged non-root user for container hardening
RUN useradd --create-home --shell /bin/bash keiki

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY agent/ ./agent/
COPY --from=fe /fe/dist ./static

RUN mkdir -p /app/backend/data/uploads && chown -R keiki:keiki /app
USER keiki

ENV PYTHONPATH=/app
ENV DEMO_MODE=false
ENV TRUST_PROXY_HEADERS=true
CMD exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers
