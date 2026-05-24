<div align="center">

```
██████╗ ██╗   ██╗██╗██╗     ██████╗  █████╗  ██████╗ ███████╗███╗   ██╗████████╗
██╔══██╗██║   ██║██║██║     ██╔══██╗██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
██████╔╝██║   ██║██║██║     ██║  ██║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
██╔══██╗██║   ██║██║██║     ██║  ██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
██████╔╝╚██████╔╝██║███████╗██████╔╝██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
```

### **An AI-native personal operating system you actually own.**

*Multi-agent orchestration. Distributed node execution. Human-in-the-loop approvals. Model-independent. Self-hosted.*

`Python 3.12` · `FastAPI` · `Next.js 15` · `Postgres + pgvector` · `Redis` · `LiteLLM` · `Docker`

</div>

---

## What is this

BuildAgent is what happens when you stop renting your AI assistant from someone else's cloud.

It runs on your hardware. It connects to your tools. It executes real commands — but only after you say yes. It talks to OpenAI, Anthropic, Google, Groq, or your local Ollama box; swap providers from a dropdown. It remembers things (P5: pgvector). It distributes work across registered nodes. It refuses to send the email until you click approve.

```
                    you ──► dashboard ──► api-gateway ──► agent loop
                                              │              │
                                              ▼              ▼
                                          approvals       skills
                                              │              │
                                              ▼              ▼
                                          litellm  ◄──── you (again, sometimes)
```

---

## Quickstart

```bash
# 1. Clone + env
git clone git@github.com:shashankshekhar2909/buildOS_Agent.git
cd buildOS_Agent
cp .env.example .env                  # fill in JWT_SECRET, FERNET_KEY, at least one provider key

# 2. Up the stack
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

# 3. Migrate
docker exec buildagent-api-gateway-1 alembic upgrade head

# 4. Smoke
./infra/scripts/smoke.sh              # register -> node -> task -> approval -> resume

# 5. Open
open http://localhost:3300            # login: admin@example.com / password123
open http://localhost:3300/onboarding # first-run checklist
```

### First run

1. Open `http://127.0.0.1:3300` or `http://localhost:3300`.
2. Sign in with `admin@example.com` / `password123`.
3. Open `/onboarding` for the shortest setup path.
4. Open `/settings` and set your provider keys or Gemini key.
5. Open `/nodes` and add a real host if you want SSH control.
6. Open `/skills` and inspect the live catalog, then save presets if needed.
7. Open `/tasks` for one-off or recurring work.

Use `127.0.0.1` if `localhost` gives you IPv6 or CORS noise.

**Free port map** — picked to dodge collisions on a populated dev machine:

| Service        | Host | Container |
| -------------- | ---- | --------- |
| Dashboard      | 3300 | 3000      |
| API Gateway    | 8800 | 8000      |
| LiteLLM        | 4400 | 4000      |
| Postgres       | 5532 | 5432      |
| Redis          | 6479 | 6379      |
| Typesense      | 8208 | 8108      |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          dashboard-web (Next.js 15)                       │
│   /agents · /agent-runs · /approvals · /skills · /messages · /tasks       │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  JWT (access + refresh, rotation)
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       api-gateway (FastAPI · SQLAlchemy 2)                │
│  auth · users · nodes · tasks · approvals · skills · agents · agent-runs  │
│  models · connectors · secrets · grants · audit · ws/client · ws/node     │
│                                                                           │
│  ┌──── in-process tool loop ────┐    ┌───── scheduler ────┐               │
│  │  drive_loop ──► LiteLLM      │    │  pending → queued  │               │
│  │  resume_with_tool_result     │    │  recurrence spawn  │               │
│  └──────────────────────────────┘    └────────────────────┘               │
└───────┬────────────────┬────────────────────────┬──────────────────┬──────┘
        │                │                        │                  │
        ▼                ▼                        ▼                  ▼
   Postgres+pgvector   Redis              LiteLLM gateway         node-runtime
   (users · tasks ·    (pub/sub ·         (5 providers, 11        (WS client,
    approvals ·         refresh           model groups —          psutil + docker,
    skills · agents ·   token store)      OpenAI/Anthropic/       command exec
    agent_runs ·                          Google/Groq/Ollama)     w/ approval flag)
    secrets · audit)
```

---

## Feature matrix

| Layer              | Status | Detail                                                                       |
| ------------------ | ------ | ---------------------------------------------------------------------------- |
| **Auth**           | done   | JWT access+refresh, jti family rotation, reuse detection, bcrypt, RBAC       |
| **Audit**          | done   | Every privileged action logged with actor, target, metadata                  |
| **Approvals**      | done   | Risk-classified gates on command/deploy/delete/restart/send_email + per-skill |
| **Secrets**        | done   | Fernet at rest, admin-only writes, plaintext never returned                  |
| **Nodes**          | done   | WS register, per-node token (hashed), heartbeat, metrics, docker monitor    |
| **Tasks**          | done   | Scheduled, recurring, cancellable, kind-routed dispatch                      |
| **Skills**         | done   | 10 real handlers — docker, fs, ssh, proxmox, gmail, calendar, notes, slack, telegram, whatsapp |
| **Agents**         | done   | 6 presets, custom DB-backed, tool-calling loop, multi-provider model picker  |
| **Agent runs**     | done   | Full message persistence, step trace, **resume-after-approval** loop         |
| **Connectors**     | done   | Telegram + Slack bot token wizards, validated against bot API on save        |
| **Memory (P5)**    | done   | pgvector · embeddings via LiteLLM · /v1/memory CRUD+search · memory skill    |
| **Tests**          | done   | pytest integration harness · 27 tests · `make test`                          |
| **Tailscale prod** | done   | `docker-compose.prod.yml` overlay binds API/Web to `$TAILSCALE_IP` only      |
| **CI**             | done   | GitHub Actions runs pytest suite on push                                     |
| **Mobile**         | scaffold | Expo Router · login + runs + approvals + agents tabs (`apps/mobile/`)      |
| **Desktop**        | scaffold | Tauri 2.x · native window around dashboard (`apps/desktop/`)               |

---

## The approval dance

This is the only feature you actually need to understand. Everything else is plumbing.

```
                       AGENT                              YOU
                         │                                 │
   user msg ────────────►│                                 │
                         │ LLM ─► tool_call: docker.rm     │
                         │                                 │
                         │ skill.requires_approval = true  │
                         │                                 │
                         │ pause: stop_reason =            │
                         │   "approval_required"           │
                         │                                 │
                         │ create Approval(                │
                         │   agent_run_id, tool_call_id,   │
                         │   tool, payload)                │
                         │                                 │
                         ├──────── notify (WS event) ─────►│
                         │                                 │
                         │                                 │ approve / deny
                         │◄──── POST /approvals/.../decide─┤
                         │                                 │
                         │ inject tool_result message      │
                         │ resume drive_loop               │
                         │                                 │
                         │ ... LLM ─► completed ──────────►│ done
```

The loop persists across restarts. Walk away mid-decision, come back, click approve, the agent picks up exactly where it stopped.

---

## Model independence

```yaml
# infra/docker/litellm.config.yaml — already wired
gpt-4o, gpt-4o-mini                    →  OPENAI_API_KEY
claude-sonnet, claude-opus, claude-haiku →  ANTHROPIC_API_KEY
gemini-pro, gemini-flash               →  GEMINI_API_KEY
groq-llama-70b, groq-llama-8b, groq-mixtral → GROQ_API_KEY
local-ollama                           →  host.docker.internal:11434
```

Set any one. The dashboard `/agents` page autoselects from a provider-grouped dropdown sourced from `/v1/models`. Bring your own keys, bring your own laptop.

## App entry points

- `/onboarding` - first-run checklist
- `/settings` - session, providers, and model routing
- `/users` - admin user CRUD
- `/nodes` - fleet and SSH fields
- `/skills` - catalog, CRUD, presets
- `/skills/[id]` - single skill detail, run UI, import/export
- `/agents` - agent roster, presets, runs
- `/tasks` - scheduled and recurring work
- `/messages` - Telegram and Slack connectors

---

## Layout

```
apps/
  dashboard-web/       Next.js 15 · App Router · shadcn/ui · TanStack Query
  node-runtime/        Python · WS client · psutil · docker SDK
  mobile/              Expo (P6 — placeholder)
  desktop/             Tauri (P6 — placeholder)

services/
  api-gateway/         FastAPI · the whole API + in-process tool loop + scheduler
  agent-runtime/       Standalone agent worker (mirror of in-process loop)

packages/
  shared-types/  sdk/  ui/  agent-core/  skill-sdk/

skills/
  docker/  filesystem/  ssh/  proxmox/  gmail/  calendar/
  notes/   slack/       telegram/  whatsapp/

infra/
  docker/         compose + litellm.config.yaml
  scripts/        smoke.sh, bootstrap.sh
```

---

## Prod deploy (tailnet-only)

```bash
export TAILSCALE_IP=100.x.y.z       # this host's tailnet IP
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.prod.yml \
  --env-file .env up -d
```

Effects:
- Postgres / Redis / LiteLLM / Typesense lose host port mappings entirely (internal docker network only).
- API + dashboard bind to `$TAILSCALE_IP` only — public-internet curls get refused at the kernel.
- API switches to multi-worker uvicorn, no `--reload`.

Set `CORS_ORIGINS` in `.env` to your tailnet origin before bringing this up.

---

## Security

- **Token-based everywhere.** User JWT (access + refresh w/ jti family). Node WS uses per-node hashed registration token. Service-to-service uses `INTERNAL_SERVICE_TOKEN`. LiteLLM gates on master key.
- **Refresh rotation with reuse detection.** Replayed refresh tokens revoke the entire family — caught via Redis-backed jti store.
- **Fernet at rest** for all secrets and connector credentials. Plaintext never crosses an API boundary outbound.
- **Approval gates** on `command|deploy|delete|restart|send_email` task kinds *and* on any skill where `manifest.requires_approval=True`.
- **Audit log** on every state-changing privileged action. Permanent. Indexed.
- **Per-skill grants** — admin maps `user × skill` explicitly before that user can invoke it.
- **Tailscale-only bind** for prod (in-progress override).

---

## Dev cheatsheet

```bash
# Live logs
docker logs -f buildagent-api-gateway-1

# Re-run smoke after backend changes
./infra/scripts/smoke.sh

# Add a new alembic migration
docker exec buildagent-api-gateway-1 alembic revision --autogenerate -m "describe change"
docker exec buildagent-api-gateway-1 alembic upgrade head

# Login as admin from CLI
curl -s -X POST http://127.0.0.1:8800/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'

# List configured providers
TOK=$(... see above)
curl -s http://127.0.0.1:8800/v1/models/providers -H "Authorization: Bearer $TOK"

# Open onboarding
open http://localhost:3300/onboarding
```

---

## Phase plan

```
P1  Foundation                                                    ████████████ done
P2  Node Runtime                                                  ████████████ done
P3  Agent Runtime + tool loop + resume                            ████████████ done
P4  Skills (10 real handlers)                                     ████████████ done
P5  Memory (pgvector + embeddings)                                ████████████ done
P6  Mobile (Expo) + Desktop (Tauri)                               ████████▒▒▒▒ wip
```

Tracked in [`CHECKLIST.md`](./CHECKLIST.md). Strategy in [`PLAN.md`](./PLAN.md).

---

## Philosophy

> *"The right amount of autonomy is the amount that ships your work without shipping a foot-cannon to production."*

BuildAgent is opinionated about three things:

1. **You own the loop.** Approval gates are not optional UX — they are load-bearing.
2. **No vendor lock-in.** LiteLLM means the model is a config string. Swap it.
3. **Self-hostable from day one.** Single docker compose up, no SaaS prerequisite.

Everything else — UI, skills, agents, memory — is in service of those three.

---

<div align="center">

**Built by [@shashankshekhar2909](https://github.com/shashankshekhar2909) · Licensed MIT (pending) · Issues + PRs welcome**

</div>
