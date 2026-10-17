#!/usr/bin/env bash
set -euo pipefail

# Validate with the same image used in production, without credentials or export.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
HOST_METRICS_ENV_FILE=/dev/null docker compose \
  -f "$repo_root/docker-compose.observability.yml" config --quiet
docker run --rm \
  -e OTEL_HOST_ID=promise9-config-check \
  -e GRAFANA_CLOUD_METRICS_URL=https://example.invalid/api/prom/push \
  -e GRAFANA_CLOUD_METRICS_USER=validation \
  -e GRAFANA_CLOUD_METRICS_TOKEN=validation \
  -v "$repo_root/deploy/observability/config.alloy:/etc/alloy/config.alloy:ro" \
  grafana/alloy:v1.20.1 validate /etc/alloy/config.alloy
