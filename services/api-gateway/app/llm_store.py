from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt, encrypt
from app.models import Secret

LLM_SCOPE = "llm:settings"
MASTER_KEY_NAME = "litellm_master_key"
GEMINI_API_KEY_NAME = "gemini_api_key"
GEMINI_MODEL_NAME = "gemini_model"
DEFAULT_CHAT_MODEL_NAME = "default_chat_model"
DEFAULT_EMBEDDING_MODEL_NAME = "default_embedding_model"
DEFAULT_AGENT_MODEL_NAME = "default_agent_model"


@dataclass
class LLMSettings:
    litellm_master_key: str
    gemini_api_key: str
    gemini_model: str
    default_chat_model: str
    default_embedding_model: str
    default_agent_model: str


_cached = LLMSettings(
    litellm_master_key="",
    gemini_api_key="",
    gemini_model="gemini-flash",
    default_chat_model="gemini-flash",
    default_embedding_model="embed-small",
    default_agent_model="gemini-flash",
)


def _env(name: str, fallback: str) -> str:
    import os

    value = os.environ.get(name, "").strip()
    return value or fallback


def _canonical_model_name(name: str) -> str:
    value = name.strip()
    aliases = {
        "gemini-2.5-flash": "gemini-flash",
        "gemini-2.5-pro": "gemini-pro",
    }
    return aliases.get(value, value)


def current_llm_settings() -> LLMSettings:
    return _cached


def litellm_master_key() -> str:
    return _cached.litellm_master_key or _env("LITELLM_MASTER_KEY", "sk-buildagent-master")


def gemini_api_key() -> str:
    return _cached.gemini_api_key or _env("GEMINI_API_KEY", "")


def gemini_model() -> str:
    return _canonical_model_name(_cached.gemini_model or _env("GEMINI_MODEL", "gemini-flash"))


def default_chat_model() -> str:
    return _canonical_model_name(_cached.default_chat_model or gemini_model())


def default_embedding_model() -> str:
    return _cached.default_embedding_model or _env("EMBEDDING_MODEL", "embed-small")


def default_agent_model() -> str:
    return _canonical_model_name(_cached.default_agent_model or gemini_model())


async def _get_setting(db: AsyncSession, name: str) -> str | None:
    row = (
        await db.execute(select(Secret).where(Secret.scope == LLM_SCOPE, Secret.name == name))
    ).scalar_one_or_none()
    if not row:
        return None
    try:
        return decrypt(row.ciphertext)
    except Exception:
        return None


async def refresh_llm_settings(db: AsyncSession) -> LLMSettings:
    global _cached
    import os

    mk = await _get_setting(db, MASTER_KEY_NAME) or os.environ.get("LITELLM_MASTER_KEY", "sk-buildagent-master")
    gk = await _get_setting(db, GEMINI_API_KEY_NAME) or os.environ.get("GEMINI_API_KEY", "")
    gm = _canonical_model_name(await _get_setting(db, GEMINI_MODEL_NAME) or os.environ.get("GEMINI_MODEL", "gemini-flash"))
    chat = _canonical_model_name(await _get_setting(db, DEFAULT_CHAT_MODEL_NAME) or gm)
    emb = await _get_setting(db, DEFAULT_EMBEDDING_MODEL_NAME) or os.environ.get("EMBEDDING_MODEL", "embed-small")
    agent = _canonical_model_name(await _get_setting(db, DEFAULT_AGENT_MODEL_NAME) or gm)
    _cached = LLMSettings(
        litellm_master_key=mk.strip(),
        gemini_api_key=gk.strip(),
        gemini_model=gm.strip(),
        default_chat_model=chat.strip(),
        default_embedding_model=emb.strip(),
        default_agent_model=agent.strip(),
    )
    return _cached


async def set_llm_setting(db: AsyncSession, name: str, value: str | None) -> None:
    row = (
        await db.execute(select(Secret).where(Secret.scope == LLM_SCOPE, Secret.name == name))
    ).scalar_one_or_none()
    if value is None or not value.strip():
        if row:
            await db.delete(row)
        return
    if row:
        row.ciphertext = encrypt(value.strip())
    else:
        db.add(Secret(scope=LLM_SCOPE, name=name, ciphertext=encrypt(value.strip()), owner_id=None))
