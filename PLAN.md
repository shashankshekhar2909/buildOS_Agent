# BuildAgent — Master Plan

Living document. Source of truth for what we're building, why, and current state.
Update at the end of every working session. Pair with `CHECKLIST.md`.

---

## North Star

Self-hosted, model-independent, infrastructure-aware personal OS. Multi-agent orchestration over distributed nodes, with human approval on dangerous ops. Runs over Tailscale.

## MVP Definition (Phase 1–2)

User can:
1. log in (JWT + refresh)
2. register a node via token
3. see node heartbeat/metrics on dashboard
4. submit a command task → node executes after approval
5. stream live logs over websocket
6. view audit trail

## Architectural Invariants

- **Infrastructure first, AI second.** Nodes, tasks, perms, events exist before agents.
- **Approval gates** on shell exec, deployments, deletes, emails, restarts.
- **Model independence** via LiteLLM gateway. Never import vendor SDKs in business logic.
- **Event-driven.** All state changes emit events. WS = transport, not source of truth.
- **Typed everywhere.** Pydantic (Py), Zod/TS types (web). Shared schema in `packages/shared-types`.
- **Audit everything.** Every approval, exec, agent action → audit log row.

## Tech Choices (locked)

| Layer | Choice |
|-------|--------|
| Web | Next.js 15 App Router, TS, Tailwind, shadcn/ui, TanStack Query, Zustand |
| API | FastAPI, Python 3.12, SQLAlchemy 2 async, Pydantic v2, Alembic |
| DB | Postgres 16 |
| Cache/Queue | Redis 7 |
| AI Gateway | LiteLLM |
| Search | Typesense |
| Vector (later) | Qdrant or pgvector |
| Container | Docker + Compose |
| Net | Tailscale |
| Node | Python (psutil, docker, websockets) |
| Mgr | pnpm (JS), uv (Py) |

## Phases

- **P1** Foundation: monorepo, infra compose, auth, dashboard shell ← in progress
- **P2** Node runtime: WS, heartbeat, metrics, exec w/ approval
- **P3** Agent runtime: workflows, approvals, task engine
- **P4** Skills: docker, gmail, calendar, notes
- **P5** Memory + AI routing
- **P6** Mobile + Desktop

## Current Session Focus

Greenfield scaffold all of P1 + P2 skeletons + P3-P6 placeholders.

## Open Questions / Deferred

- pgvector vs Qdrant — defer to P5
- Mobile RN vs Expo vs PWA — defer to P6
- Auth: native JWT first, OIDC later
- Multi-tenant? Single-user for now

## Conventions

- Python services: `app/` package, `app/main.py` entrypoint, `pyproject.toml` w/ uv
- Each service has own `Dockerfile` + `.env.example`
- Web: App Router, server components default, client only when needed
- All API routes versioned `/v1/*`
- Events named `domain.verb` (e.g. `node.online`, `task.completed`)
