"""Embeddings via LiteLLM gateway. Provider-agnostic — config picks model."""
from __future__ import annotations

import os
from openai import AsyncOpenAI

from app.config import get_settings


def _client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(base_url=settings.litellm_url, api_key=settings.litellm_master_key)


def embedding_model() -> str:
    return os.environ.get("EMBEDDING_MODEL", "embed-small")


async def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _client()
    res = await client.embeddings.create(model=embedding_model(), input=texts)
    return [d.embedding for d in res.data]


async def embed_one(text: str) -> list[float]:
    out = await embed([text])
    return out[0] if out else []
