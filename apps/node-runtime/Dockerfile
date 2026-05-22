FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /srv

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/node-runtime/pyproject.toml ./pyproject.toml
RUN pip install --upgrade pip && pip install -e .

COPY apps/node-runtime/node_runtime ./node_runtime

CMD ["python", "-m", "node_runtime"]
