import secrets

from tests.conftest import auth_h


async def test_register_and_list_device(client, user):
    tok = f"ExponentPushToken[fake-{secrets.token_hex(8)}]"
    res = await client.post(
        "/v1/devices",
        headers=auth_h(user["access_token"]),
        json={"push_token": tok, "platform": "ios"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["push_token"] == tok
    assert body["platform"] == "ios"

    listing = await client.get("/v1/devices", headers=auth_h(user["access_token"]))
    assert listing.status_code == 200
    ids = [d["id"] for d in listing.json()]
    assert body["id"] in ids


async def test_register_idempotent_on_same_token(client, user):
    tok = f"ExponentPushToken[idempotent-{secrets.token_hex(8)}]"
    first = await client.post("/v1/devices", headers=auth_h(user["access_token"]), json={"push_token": tok, "platform": "android"})
    second = await client.post("/v1/devices", headers=auth_h(user["access_token"]), json={"push_token": tok, "platform": "android"})
    assert first.status_code == 201
    assert second.status_code in (200, 201)
    assert first.json()["id"] == second.json()["id"]


async def test_unregister(client, user):
    tok = f"ExponentPushToken[del-{secrets.token_hex(8)}]"
    created = await client.post("/v1/devices", headers=auth_h(user["access_token"]), json={"push_token": tok})
    did = created.json()["id"]
    res = await client.delete(f"/v1/devices/{did}", headers=auth_h(user["access_token"]))
    assert res.status_code == 204
    again = await client.delete(f"/v1/devices/{did}", headers=auth_h(user["access_token"]))
    assert again.status_code == 404
