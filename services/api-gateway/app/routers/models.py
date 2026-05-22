from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends

from app.auth.deps import current_user
from app.config import get_settings
from app.models import User

router = APIRouter(prefix="/v1/models", tags=["models"])


_PROVIDERS = {
    "openai": ("OPENAI_API_KEY", "OpenAI"),
    "anthropic": ("ANTHROPIC_API_KEY", "Anthropic"),
    "gemini": ("GEMINI_API_KEY", "Google Gemini"),
    "groq": ("GROQ_API_KEY", "Groq"),
    "ollama": (None, "Ollama (local)"),
}


def _classify(model_name: str, upstream: str) -> str:
    target = (upstream or model_name).lower()
    if target.startswith("openai/") or "gpt-" in target:
        return "openai"
    if target.startswith("anthropic/") or "claude" in target:
        return "anthropic"
    if target.startswith("gemini/") or "gemini" in target:
        return "gemini"
    if target.startswith("groq/") or target.startswith("groq-") or "groq" in target:
        return "groq"
    if target.startswith("ollama/") or "ollama" in target or "llama" in target and "groq" not in target:
        return "ollama"
    return "other"


@router.get("")
async def list_models(_user: Annotated[User, Depends(current_user)]) -> dict:
    settings = get_settings()
    url = f"{settings.litellm_url.rstrip('/')}/v1/models"
    headers = {"Authorization": f"Bearer {settings.litellm_master_key}"}
    items: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, headers=headers)
            res.raise_for_status()
            data = res.json()
        for entry in data.get("data", []):
            mid = entry.get("id") or entry.get("model_name") or ""
            upstream = entry.get("litellm_params", {}).get("model", "") if isinstance(entry, dict) else ""
            provider = _classify(mid, upstream)
            items.append({"id": mid, "provider": provider, "upstream": upstream})
    except Exception as exc:
        return {"ok": False, "error": str(exc), "models": []}
    return {"ok": True, "models": items}


@router.get("/providers")
async def providers(_user: Annotated[User, Depends(current_user)]) -> list[dict]:
    import os

    out: list[dict] = []
    for key, (env, label) in _PROVIDERS.items():
        configured = True if env is None else bool(os.environ.get(env))
        out.append({"id": key, "label": label, "configured": configured, "env": env})
    return out
