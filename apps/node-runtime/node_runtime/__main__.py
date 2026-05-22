import asyncio
import json
import logging
import sys
from urllib.parse import urlencode

import websockets

from node_runtime.config import settings
from node_runtime.docker_monitor import list_containers
from node_runtime.executor import run_command
from node_runtime.metrics import snapshot

log = logging.getLogger("node-runtime")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def heartbeat(ws, interval: float) -> None:
    while True:
        try:
            await ws.send(json.dumps({"type": "heartbeat", "metrics": snapshot(), "containers": list_containers()}))
        except Exception as e:
            log.warning("heartbeat send failed: %s", e)
            return
        await asyncio.sleep(interval)


async def handle_message(ws, msg: dict) -> None:
    t = msg.get("type")
    if t == "task.exec":
        task_id = msg.get("task_id")
        cmd = msg.get("cmd") or []
        approved = msg.get("approved", False)
        if not approved:
            await ws.send(json.dumps({"type": "task.result", "data": {"task_id": task_id, "ok": False, "error": "not_approved"}}))
            return
        await ws.send(json.dumps({"type": "task.started", "data": {"task_id": task_id}}))
        result = await run_command(cmd, timeout=msg.get("timeout", 60))
        await ws.send(json.dumps({"type": "task.result", "data": {"task_id": task_id, **result}}))


async def run() -> None:
    cfg = settings()
    if not cfg.node_id or not cfg.node_token:
        log.error("NODE_ID and NODE_TOKEN must be set in env")
        sys.exit(2)
    url = f"{cfg.ws_url}?{urlencode({'token': cfg.node_token, 'node_id': cfg.node_id})}"

    while True:
        try:
            log.info("connecting %s", cfg.ws_url)
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                log.info("connected")
                hb = asyncio.create_task(heartbeat(ws, cfg.heartbeat_interval_s))
                try:
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        await handle_message(ws, msg)
                finally:
                    hb.cancel()
        except Exception as e:
            log.warning("ws error: %s — retrying in 3s", e)
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run())
