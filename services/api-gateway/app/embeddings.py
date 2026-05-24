"""Embeddings via LiteLLM gateway. Provider-agnostic — config picks model."""
from __future__ import annotations

import os
from openai import AsyncOpenAI

from app.config import get_settings
from app.llm_store import default_embedding_model, litellm_master_key


def _client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(base_url=settings.litellm_url, api_key=litellm_master_key())


def embedding_model() -> str:
    return default_embedding_model() or os.environ.get("EMBEDDING_MODEL", "embed-small")


async def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _client()
    res = await client.embeddings.create(model=embedding_model(), input=texts)
    return [d.embedding for d in res.data]


async def embed_one(text: str) -> list[float]:
    out = await embed([text])
    return out[0] if out else []
