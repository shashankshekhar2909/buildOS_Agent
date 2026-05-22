from typing import Any

try:
    import docker
    _client = docker.from_env()
except Exception:
    _client = None


def list_containers() -> list[dict[str, Any]]:
    if _client is None:
        return []
    try:
        return [
            {
                "id": c.short_id,
                "name": c.name,
                "image": (c.image.tags[0] if c.image.tags else c.image.short_id),
                "status": c.status,
            }
            for c in _client.containers.list(all=True)
        ]
    except Exception:
        return []
