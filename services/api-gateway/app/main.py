from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, engine  # noqa: F401
from app.routers import approvals, audit, auth, grants, nodes, secrets as secrets_router, tasks
from app.ws import client as ws_client, node as ws_node

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Schema owned by alembic — run `make migrate` before first boot.
    yield


app = FastAPI(title="BuildAgent API", version="0.0.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(nodes.router)
app.include_router(tasks.router)
app.include_router(approvals.router)
app.include_router(audit.router)
app.include_router(secrets_router.router)
app.include_router(grants.router)
app.include_router(ws_node.router)
app.include_router(ws_client.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.get("/readyz")
async def readyz() -> dict:
    return {"ready": True}
