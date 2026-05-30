FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Install build deps for bcrypt/cryptography wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY services/api-gateway/pyproject.toml ./pyproject.toml
RUN pip install --upgrade pip && pip install -e .

COPY packages/skill-sdk ./packages/skill-sdk
COPY skills ./skills
COPY services/api-gateway/app ./app
COPY services/api-gateway/alembic ./alembic
COPY services/api-gateway/alembic.ini ./alembic.ini

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
