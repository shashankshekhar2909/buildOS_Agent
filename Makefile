.PHONY: up down logs api web node fmt test test-install

up:
	bash infra/scripts/bootstrap.sh

down:
	docker compose -f infra/docker/docker-compose.yml down

logs:
	docker compose -f infra/docker/docker-compose.yml logs -f

api:
	cd services/api-gateway && uv run uvicorn app.main:app --reload --port 8000

web:
	cd apps/dashboard-web && pnpm dev

node:
	cd apps/node-runtime && uv run python -m node_runtime

migrate:
	cd services/api-gateway && uv run alembic upgrade head

revision:
	cd services/api-gateway && uv run alembic revision --autogenerate -m "$(m)"

test-install:
	python3 -m venv .venv-test
	.venv-test/bin/pip install -q -r tests/requirements.txt

test:
	PYTHONPATH=. .venv-test/bin/python -m pytest tests -c tests/pytest.ini
