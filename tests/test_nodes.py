from tests.conftest import auth_h


async def test_admin_can_create_node(client, admin):
    import secrets
    name = f"test-node-{secrets.token_hex(4)}"
    res = await client.post("/v1/nodes", headers=auth_h(admin["access_token"]), json={"name": name})
    assert res.status_code == 201, res.text
    body = res.json()
    assert "node" in body and "register_token" in body
    assert body["node"]["name"] == name
    # Register token is one-time; should be a non-empty string only returned here.
    assert isinstance(body["register_token"], str) and len(body["register_token"]) > 16


async def test_viewer_cannot_create_node(client, user):
    res = await client.post("/v1/nodes", headers=auth_h(user["access_token"]), json={"name": "viewer-attempt"})
    assert res.status_code in (401, 403)
