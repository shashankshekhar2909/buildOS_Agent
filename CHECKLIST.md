# BuildAgent — Build Checklist

Mark `[x]` when done. Add date + short note. Pair with `PLAN.md`.
Granular. One leaf = one verifiable artifact or behavior.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

---

## P1 — Foundation

### Repo
- [x] monorepo dir tree — 2026-05-23
- [x] root `package.json` + `pnpm-workspace.yaml` — 2026-05-23
- [x] `.gitignore` — 2026-05-23
- [x] `.env.example` (incl. host port map + JWT + service tokens) — 2026-05-23
- [x] `README.md` — 2026-05-23
- [x] `PLAN.md` + `CHECKLIST.md` — 2026-05-23
- [x] root `Makefile` — 2026-05-23
- [x] `git init` + first commit — 2026-05-23

### Infra (docker compose)
- [x] postgres (host 5532 → 5432) — 2026-05-23
- [x] redis (6479 → 6379) — 2026-05-23
- [x] litellm (4400 → 4000) — 2026-05-23
- [x] typesense (8208 → 8108) — 2026-05-23
- [x] api-gateway (8800 → 8000) — 2026-05-23
- [x] dashboard-web (3300 → 3000) — 2026-05-23
- [x] `litellm.config.yaml` — 2026-05-23
- [x] `infra/scripts/bootstrap.sh` — 2026-05-23
- [ ] verify `docker compose up -d` healthchecks pass (needs user run)

### API Gateway (services/api-gateway)
- [x] pyproject.toml — 2026-05-23
- [x] config + db + models (user/node/task/audit/approval/skill) — 2026-05-23
- [x] JWT auth (access + refresh + bcrypt) — 2026-05-23
- [x] `current_user` + `require_role` + `require_internal_token` + `require_node_token` — 2026-05-23
- [x] routers: auth, nodes, tasks, approvals, audit — 2026-05-23
- [x] approval gate on shell/deploy/delete/restart/send_email kinds — 2026-05-23
- [x] events bus (redis pub/sub) — 2026-05-23
- [x] WS endpoints: /ws/node (per-node token), /ws/client (user JWT) — 2026-05-23
- [x] healthz/readyz — 2026-05-23
- [x] Dockerfile — 2026-05-23
- [x] dev-mode auto create_all (alembic later) — 2026-05-23
- [x] alembic env.py + script.py.mako + alembic.ini — 2026-05-23
- [x] init revision generated + applied against live postgres — 2026-05-23
- [x] dispatcher: command tasks → node WS, persist task.result/started — 2026-05-23
- [ ] tests

### Dashboard (apps/dashboard-web)
- [x] Next.js 15 + TS + Tailwind + dark — 2026-05-23
- [x] App Router shell w/ sidebar — 2026-05-23
- [x] /login (register + login) — 2026-05-23
- [x] /overview wired to /v1/nodes — 2026-05-23
- [x] /nodes table — 2026-05-23
- [x] /agents /skills /tasks /logs /memory /settings stubs — 2026-05-23
- [x] api client + WS hook + token storage — 2026-05-23
- [x] Dockerfile (standalone output) — 2026-05-23
- [ ] shadcn/ui init (needs `npx shadcn init` once node deps install)
- [x] approvals UI w/ approve/deny — 2026-05-23
- [x] tasks UI w/ create form, state pills, cancel — 2026-05-23
- [x] WS bridge invalidates queries on node./task./approval. events — 2026-05-23

## P2 — Node Runtime
- [x] pyproject.toml — 2026-05-23
- [x] ws client w/ reconnect — 2026-05-23
- [x] heartbeat (5s) — 2026-05-23
- [x] psutil metrics — 2026-05-23
- [x] docker monitor — 2026-05-23
- [x] command executor w/ approval flag — 2026-05-23
- [x] Dockerfile — 2026-05-23

## P3 — Agent Runtime
- [x] LiteLLM client (OpenAI-compatible) — 2026-05-23
- [x] base Agent + Tool dataclasses — 2026-05-23
- [x] CoreAgent + Infra/Mail/Research/Dev/Notes — 2026-05-23
- [x] task_engine skeleton — 2026-05-23
- [x] inline dispatcher for command tasks (queued → node WS exec) — 2026-05-23
- [ ] standalone agent-runtime worker (poll/dispatch/retry/deps for skill/agent/workflow kinds)
- [ ] tool-calling loop
- [ ] approval handshake from agent path

## P4 — Skills
- [x] packages/skill-sdk — 2026-05-23
- [x] skills/docker (stub) — 2026-05-23
- [x] skills/filesystem (stub) — 2026-05-23
- [x] skills/notes (stub) — 2026-05-23
- [x] skills/gmail /calendar /ssh /proxmox (stubs) — 2026-05-23
- [ ] real handlers
- [ ] skill registry endpoint in api-gateway

## P5 — Memory + AI Routing
- [ ] memory-service skeleton
- [ ] embeddings via LiteLLM
- [ ] pgvector or qdrant decision

## P6 — Mobile + Desktop
- [ ] apps/mobile (Expo)
- [ ] apps/desktop (Tauri)

## Shared Packages
- [x] packages/shared-types — 2026-05-23
- [x] packages/sdk (TS client) — 2026-05-23
- [x] packages/ui stub — 2026-05-23
- [x] packages/agent-core stub — 2026-05-23
- [x] packages/skill-sdk — 2026-05-23

## Security Hard Requirements
- [x] JWT access + refresh — 2026-05-23
- [x] role gate (admin/operator/viewer) — 2026-05-23
- [x] audit logs on privileged actions — 2026-05-23
- [x] approval workflow on shell exec / deploy / delete / restart / send_email — 2026-05-23
- [x] per-node registration token (hashed) + global NODE_TOKEN fallback — 2026-05-23
- [x] INTERNAL_SERVICE_TOKEN header for service-to-service — 2026-05-23
- [x] secrets encrypted at rest (fernet) + /v1/secrets endpoint — 2026-05-23
- [x] refresh token rotation (jti+family, redis-backed, reuse detection revokes family) — 2026-05-23
- [x] per-skill permission scopes enforced (SkillGrant table + /v1/grants + tasks router gate) — 2026-05-23
- [x] live smoke test end-to-end pass (register → node → command → approval → dispatch → failed:node-offline) — 2026-05-23
- [ ] Tailscale-only bind in prod compose override
