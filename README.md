# BuildAgent

AI-native personal operating system. Multi-agent orchestration, infrastructure control, distributed node execution.

## Quickstart

```bash
# 1. Bring up infra (Postgres, Redis, LiteLLM)
docker compose -f infra/docker/docker-compose.yml up -d

# 2. API gateway
cd services/api-gateway && uv sync && uv run uvicorn app.main:app --reload --port 8000

# 3. Dashboard
cd apps/dashboard-web && pnpm install && pnpm dev

# 4. Node runtime (on any node)
cd apps/node-runtime && uv sync && uv run python -m node_runtime
```

## Layout

```
apps/        dashboard-web, mobile, desktop, node-runtime
services/    api-gateway, auth, ws, agent-runtime, memory, task, skill, notification
packages/    ui, sdk, shared-types, agent-core, skill-sdk
skills/      gmail, calendar, docker, proxmox, ssh, notes, filesystem
infra/       docker, nginx, scripts
```

## Phases

- **P1** Foundation: monorepo, auth, dashboard
- **P2** Node Runtime: websocket, monitoring, exec
- **P3** Agent Runtime: workflows, approvals, task engine
- **P4** Skills: docker, gmail, calendar, notes
- **P5** Memory + AI routing
- **P6** Mobile + Desktop

## Security

JWT + refresh. RBAC. Audit logs. Encrypted secrets. Approval gates on dangerous ops. Tailscale-only network.

## Stack

Next.js 15 · TypeScript · Tailwind · shadcn/ui · TanStack Query · Zustand
FastAPI · Python 3.12 · SQLAlchemy 2 · Pydantic v2 · Alembic
Postgres · Redis · LiteLLM · Typesense · Qdrant (later)
Docker · Tailscale
