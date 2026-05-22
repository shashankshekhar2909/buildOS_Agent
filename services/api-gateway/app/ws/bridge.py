"""Redis pubsub -> dashboard WS bridge.

Subscribes to `buildagent.events` and forwards every message to all connected
client websockets. Keeps routers free of double-emit boilerplate — they call
events.publish() and the bridge fans out to UI.
"""
from __future__ import annotations

import asyncio
import json

from app.events import subscribe
from app.ws.manager import manager


async def run_event_bridge(stop_event: asyncio.Event) -> None:
    pubsub = await subscribe()
    try:
        while not stop_event.is_set():
            try:
                msg = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0), timeout=2.0)
            except (asyncio.TimeoutError, TimeoutError):
                msg = None
            if not msg:
                continue
            raw = msg.get("data")
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except Exception:
                continue
            await manager.broadcast_clients(payload)
    finally:
        try:
            await pubsub.unsubscribe("buildagent.events")
            await pubsub.close()
        except Exception:
            pass
