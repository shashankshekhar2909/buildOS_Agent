import asyncio
import json
from collections import defaultdict
from typing import Any
from fastapi import WebSocket


class WSManager:
    """Tracks live websocket connections for nodes and dashboard clients."""

    def __init__(self) -> None:
        self.node_conns: dict[str, WebSocket] = {}
        self.client_conns: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def attach_node(self, node_id: str, ws: WebSocket) -> None:
        async with self._lock:
            old = self.node_conns.get(node_id)
            if old:
                try:
                    await old.close(code=4000)
                except Exception:
                    pass
            self.node_conns[node_id] = ws

    async def detach_node(self, node_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if self.node_conns.get(node_id) is ws:
                self.node_conns.pop(node_id, None)

    async def attach_client(self, ws: WebSocket) -> None:
        async with self._lock:
            self.client_conns.add(ws)

    async def detach_client(self, ws: WebSocket) -> None:
        async with self._lock:
            self.client_conns.discard(ws)

    async def send_to_node(self, node_id: str, msg: dict[str, Any]) -> bool:
        ws = self.node_conns.get(node_id)
        if not ws:
            return False
        await ws.send_text(json.dumps(msg))
        return True

    async def broadcast_clients(self, msg: dict[str, Any]) -> None:
        data = json.dumps(msg)
        dead: list[WebSocket] = []
        for ws in list(self.client_conns):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.client_conns.discard(ws)


manager = WSManager()
