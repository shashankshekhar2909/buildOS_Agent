async def test_healthz(client):
    res = await client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


async def test_readyz(client):
    res = await client.get("/readyz")
    assert res.status_code == 200
    assert res.json() == {"ready": True}
