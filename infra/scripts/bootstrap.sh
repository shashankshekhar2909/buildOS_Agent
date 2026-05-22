#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[bootstrap] created .env from example — edit secrets before prod"
fi

echo "[bootstrap] starting infra (postgres, redis, litellm, typesense)"
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

echo "[bootstrap] waiting for postgres..."
until docker compose -f infra/docker/docker-compose.yml exec -T postgres pg_isready -U buildagent >/dev/null 2>&1; do
  sleep 1
done

echo "[bootstrap] infra up."
