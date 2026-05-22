"""Agent catalog + run shape. Skips LLM round-trip if no provider key."""
import os
import pytest

from tests.conftest import auth_h


async def test_agents_list(client, user):
    res = await client.get("/v1/agents", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    names = {a["name"] for a in res.json()}
    # Presets seeded at boot.
    assert {"core", "infra", "mail", "messenger", "notes", "dev"}.issubset(names)


async def test_unknown_agent_run_404(client, admin):
    res = await client.post(
        "/v1/agents/no-such-agent/run",
        headers=auth_h(admin["access_token"]),
        json={"message": "hi", "max_steps": 1},
    )
    assert res.status_code == 404


@pytest.mark.skipif(
    not any(os.environ.get(k) for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY")),
    reason="needs at least one LLM provider key in env",
)
async def test_agent_run_persists(client, admin):
    res = await client.post(
        "/v1/agents/core/run",
        headers=auth_h(admin["access_token"]),
        json={"message": "Say the single word OK.", "max_steps": 1, "model": "claude-haiku"},
    )
    # Either succeeds or 502 (upstream auth). Persistence happens either way for success.
    if res.status_code == 200:
        body = res.json()
        assert "run_id" in body
        assert "state" in body
        # Detail endpoint returns the persisted row.
        runs = await client.get(f"/v1/agent-runs/{body['run_id']}", headers=auth_h(admin["access_token"]))
        assert runs.status_code == 200
        assert runs.json()["agent_name"] == "core"


async def test_agent_runs_list_endpoint(client, admin):
    res = await client.get("/v1/agent-runs", headers=auth_h(admin["access_token"]))
    assert res.status_code == 200
    assert isinstance(res.json(), list)
