import json
from typing import Any
import redis.asyncio as redis

from app.config import get_settings

_settings = get_settings()
_pool: redis.Redis | None = None


def client() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.from_url(_settings.redis_url, decode_responses=True)
    return _pool


async def publish(event: str, payload: dict[str, Any]) -> None:
    await client().publish("buildagent.events", json.dumps({"event": event, "data": payload}))


async def subscribe():
    pubsub = client().pubsub()
    await pubsub.subscribe("buildagent.events")
    return pubsub
