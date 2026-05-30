import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import ensure_bootstrap_admin
from app.agent_catalog import sync_agent_catalog
from app.config import get_settings
from app.db import Base, SessionLocal, engine  # noqa: F401
from app.llm_store import refresh_llm_settings
from app.routers import agent_runs, agents, approvals, audit, auth, connectors, devices, grants, memory as memory_router, models as models_router, nodes, projects, secrets as secrets_router, skills, tasks, users
from app.skill_loader import sync_skill_catalog
from app.scheduler import run_task_scheduler
from app.ws import client as ws_client, node as ws_node
from app.ws.bridge import run_event_bridge

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Schema owned by alembic — run `make migrate` before first boot.
    stop_event = asyncio.Event()
    async with SessionLocal() as db:
        await ensure_bootstrap_admin(db)
        await sync_skill_catalog(db)
        await sync_agent_catalog(db)
        await refresh_llm_settings(db)
    scheduler_task = asyncio.create_task(run_task_scheduler(stop_event))
    bridge_task = asyncio.create_task(run_event_bridge(stop_event))
    yield
    stop_event.set()
    scheduler_task.cancel()
    bridge_task.cancel()
    for t in (scheduler_task, bridge_task):
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(title="BuildAgent API", version="0.0.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://.+:3300$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(nodes.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(approvals.router)
app.include_router(audit.router)
app.include_router(secrets_router.router)
app.include_router(connectors.router)
app.include_router(grants.router)
app.include_router(skills.router)
app.include_router(agents.router)
app.include_router(users.router)
app.include_router(agent_runs.router)
app.include_router(memory_router.router)
app.include_router(devices.router)
app.include_router(models_router.router)
app.include_router(ws_node.router)
app.include_router(ws_client.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.get("/readyz")
async def readyz() -> dict:
    return {"ready": True}
