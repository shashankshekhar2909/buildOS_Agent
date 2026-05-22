from tests.conftest import auth_h


async def test_providers_listed(client, user):
    res = await client.get("/v1/models/providers", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    items = res.json()
    ids = {p["id"] for p in items}
    assert {"openai", "anthropic", "gemini", "groq", "ollama"}.issubset(ids)


async def test_models_list_includes_providers(client, user):
    res = await client.get("/v1/models", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    body = res.json()
    if not body.get("ok"):
        # LiteLLM unreachable in this env — fine, just verify error shape.
        assert "error" in body
        return
    classes = {m["provider"] for m in body["models"]}
    # At least openai/anthropic/gemini/groq/ollama are in the config.
    assert {"openai", "anthropic", "gemini", "groq", "ollama"}.issubset(classes)
