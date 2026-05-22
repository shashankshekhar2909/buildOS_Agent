import json
from datetime import datetime, timezone
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.auth.jwt import verify_password
from app.config import get_settings
from app.db import SessionLocal
from app.events import publish
from app.models import Node
from app.ws.manager import manager

router = APIRouter()


@router.websocket("/ws/node")
async def node_socket(ws: WebSocket, token: str = Query(...), node_id: str = Query(...)) -> None:
    """Node-runtime connection. Auth via per-node token issued at registration."""
    settings = get_settings()
    async with SessionLocal() as db:
        node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
        if not node:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        # Accept either the per-node registration token (hashed) or the global shared NODE_TOKEN fallback.
        ok = verify_password(token, node.token_hash) if node.token_hash else False
        if not ok and token != settings.node_token:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await ws.accept()
        await manager.attach_node(node_id, ws)
        node.status = "online"
        node.last_seen = datetime.now(tz=timezone.utc)
        await db.commit()
        await publish("node.online", {"id": node_id})
        await manager.broadcast_clients({"event": "node.online", "data": {"id": node_id}})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "heartbeat":
                async with SessionLocal() as db:
                    n = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
                    if n:
                        n.last_metrics = msg.get("metrics", {})
                        n.last_seen = datetime.now(tz=timezone.utc)
                        await db.commit()
                await manager.broadcast_clients({"event": "node.heartbeat", "data": {"id": node_id, "metrics": msg.get("metrics", {})}})
            elif kind in ("task.result", "task.log", "task.started"):
                await manager.broadcast_clients({"event": kind, "data": msg.get("data", {})})
                await publish(kind, msg.get("data", {}))
    except WebSocketDisconnect:
        pass
    finally:
        await manager.detach_node(node_id, ws)
        async with SessionLocal() as db:
            n = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
            if n:
                n.status = "offline"
                await db.commit()
        await publish("node.offline", {"id": node_id})
        await manager.broadcast_clients({"event": "node.offline", "data": {"id": node_id}})
