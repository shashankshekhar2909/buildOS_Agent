from __future__ import annotations

import os
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.deps import current_user, require_role
from app.config import get_settings
from app.db import get_db
from app.llm_store import (
    DEFAULT_AGENT_MODEL_NAME,
    DEFAULT_CHAT_MODEL_NAME,
    DEFAULT_EMBEDDING_MODEL_NAME,
    GEMINI_API_KEY_NAME,
    GEMINI_MODEL_NAME,
    MASTER_KEY_NAME,
    current_llm_settings,
    default_agent_model,
    default_chat_model,
    default_embedding_model,
    gemini_model,
    litellm_master_key,
    refresh_llm_settings,
    set_llm_setting,
)
from app.provider_store import delete_provider_secret, provider_configured, upsert_provider_secret
from app.models import User
from sqlalchemy.ext.asyncio import AsyncSession

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
    headers = {"Authorization": f"Bearer {litellm_master_key()}"}
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
async def providers(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[dict]:
    out: list[dict] = []
    for key, (env, label) in _PROVIDERS.items():
        env_value = None if env is None else os.environ.get(env)
        configured, source = await provider_configured(db, key, env_value)
        out.append({"id": key, "label": label, "configured": configured, "source": source, "env": env})
    return out


@router.get("/providers/me")
async def providers_me(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> list[dict]:
    out: list[dict] = []
    for key, (env, label) in _PROVIDERS.items():
        env_value = None if env is None else os.environ.get(env)
        configured, source = await provider_configured(db, key, env_value, owner_id=user.id)
        out.append({"id": key, "label": label, "configured": configured, "source": source, "env": env})
    return out


class LLMSettingsIn(BaseModel):
    litellm_master_key: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    default_chat_model: str | None = None
    default_embedding_model: str | None = None
    default_agent_model: str | None = None


@router.get("/settings")
async def get_settings_view(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> dict:
    cached = current_llm_settings()
    env_master = os.environ.get("LITELLM_MASTER_KEY", "").strip()
    env_gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    env_gemini_model = os.environ.get("GEMINI_MODEL", "").strip()
    env_embedding = os.environ.get("EMBEDDING_MODEL", "").strip()
    master_source = "db" if cached.litellm_master_key and cached.litellm_master_key != env_master else ("env" if env_master else "none")
    gemini_key_source = "db" if cached.gemini_api_key and cached.gemini_api_key != env_gemini_key else ("env" if env_gemini_key else "none")
    gemini_model_source = "db" if cached.gemini_model and cached.gemini_model != env_gemini_model else ("env" if env_gemini_model else "none")
    chat_source = "db" if cached.default_chat_model and cached.default_chat_model != (cached.gemini_model or env_gemini_model) else ("env" if (cached.gemini_model or env_gemini_model) else "none")
    emb_source = "db" if cached.default_embedding_model and cached.default_embedding_model != env_embedding else ("env" if env_embedding else "none")
    agent_source = "db" if cached.default_agent_model and cached.default_agent_model != (cached.gemini_model or env_gemini_model) else ("env" if (cached.gemini_model or env_gemini_model) else "none")
    return {
        "litellm_master_key": {
            "configured": bool(cached.litellm_master_key or env_master),
            "source": master_source,
        },
        "gemini_api_key": {
            "configured": bool(cached.gemini_api_key or env_gemini_key),
            "source": gemini_key_source,
        },
        "gemini_model": {
            "value": cached.gemini_model or gemini_model(),
            "source": gemini_model_source,
        },
        "default_chat_model": {"value": cached.default_chat_model or default_chat_model(), "source": chat_source},
        "default_embedding_model": {"value": cached.default_embedding_model or env_embedding or default_embedding_model(), "source": emb_source},
        "default_agent_model": {"value": cached.default_agent_model or default_agent_model(), "source": agent_source},
    }


@router.put("/settings")
async def save_settings_view(
    body: LLMSettingsIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin"))],
) -> dict:
    if body.litellm_master_key is not None:
        await set_llm_setting(db, MASTER_KEY_NAME, body.litellm_master_key)
    if body.gemini_api_key is not None:
        await set_llm_setting(db, GEMINI_API_KEY_NAME, body.gemini_api_key)
    if body.gemini_model is not None:
        await set_llm_setting(db, GEMINI_MODEL_NAME, body.gemini_model)
    if body.default_chat_model is not None:
        await set_llm_setting(db, DEFAULT_CHAT_MODEL_NAME, body.default_chat_model)
    if body.default_embedding_model is not None:
        await set_llm_setting(db, DEFAULT_EMBEDDING_MODEL_NAME, body.default_embedding_model)
    if body.default_agent_model is not None:
        await set_llm_setting(db, DEFAULT_AGENT_MODEL_NAME, body.default_agent_model)
    await db.commit()
    await refresh_llm_settings(db)
    cached = current_llm_settings()
    return {
        "ok": True,
        "litellm_master_key": {
            "configured": bool(cached.litellm_master_key),
            "source": "db" if cached.litellm_master_key else "none",
        },
        "gemini_api_key": {
            "configured": bool(cached.gemini_api_key),
            "source": "db" if cached.gemini_api_key else "none",
        },
        "gemini_model": {"value": cached.gemini_model, "source": "db"},
        "default_chat_model": {"value": cached.default_chat_model, "source": "db"},
        "default_embedding_model": {"value": cached.default_embedding_model, "source": "db"},
        "default_agent_model": {"value": cached.default_agent_model, "source": "db"},
    }


class ProviderKeyIn(BaseModel):
    api_key: str | None = None


@router.put("/providers/{provider}")
async def upsert_provider(
    provider: str,
    body: ProviderKeyIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin"))],
) -> dict:
    if provider not in _PROVIDERS or provider == "ollama":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "provider not found")
    if not body.api_key or not body.api_key.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "api_key required")
    await upsert_provider_secret(db, provider, body.api_key.strip())
    await db.commit()
    return {"ok": True, "provider": provider, "configured": True, "source": "db"}


@router.put("/providers/me/{provider}")
async def upsert_provider_me(
    provider: str,
    body: ProviderKeyIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> dict:
    if provider not in _PROVIDERS or provider == "ollama":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "provider not found")
    if not body.api_key or not body.api_key.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "api_key required")
    await upsert_provider_secret(db, provider, body.api_key.strip(), owner_id=user.id)
    await db.commit()
    return {"ok": True, "provider": provider, "configured": True, "source": "user-db"}


@router.delete("/providers/{provider}")
async def delete_provider(
    provider: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin"))],
) -> dict:
    if provider not in _PROVIDERS or provider == "ollama":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "provider not found")
    await delete_provider_secret(db, provider)
    await db.commit()
    return {"ok": True, "provider": provider, "configured": False, "source": "none"}


@router.delete("/providers/me/{provider}")
async def delete_provider_me(
    provider: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> dict:
    if provider not in _PROVIDERS or provider == "ollama":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "provider not found")
    await delete_provider_secret(db, provider, owner_id=user.id)
    await db.commit()
    return {"ok": True, "provider": provider, "configured": False, "source": "none"}
