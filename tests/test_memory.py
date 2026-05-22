"""Memory CRUD + search. Embedding-dependent paths skip without provider key."""
import os
import pytest

from tests.conftest import auth_h


async def test_memory_meta_model(client, user):
    res = await client.get("/v1/memory/_meta/model", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    body = res.json()
    assert body["dim"] == 1536
    assert isinstance(body["model"], str)


async def test_memory_list_empty(client, user):
    res = await client.get("/v1/memory", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.skipif(
    not any(os.environ.get(k) for k in ("OPENAI_API_KEY", "GEMINI_API_KEY")),
    reason="needs embedding provider key",
)
async def test_memory_store_then_recall(client, user):
    create = await client.post(
        "/v1/memory",
        headers=auth_h(user["access_token"]),
        json={"text": "BuildAgent runs in docker.", "kind": "fact"},
    )
    if create.status_code == 502:
        pytest.skip("embedding upstream not configured")
    assert create.status_code == 201, create.text
    mem = create.json()
    assert mem["text"] == "BuildAgent runs in docker."

    search = await client.post(
        "/v1/memory/search",
        headers=auth_h(user["access_token"]),
        json={"query": "where does BuildAgent run?", "limit": 5},
    )
    assert search.status_code == 200
    hits = search.json()
    assert len(hits) >= 1
    assert hits[0]["score"] is not None


async def test_memory_create_without_text_rejected(client, user):
    res = await client.post("/v1/memory", headers=auth_h(user["access_token"]), json={"text": "", "kind": "fact"})
    assert res.status_code in (400, 422)
