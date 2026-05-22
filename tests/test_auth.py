from tests.conftest import auth_h


async def test_register_login_me(client, user):
    res = await client.post("/v1/auth/login", json={"email": user["email"], "password": user["password"]})
    assert res.status_code == 200
    tokens = res.json()
    assert "access_token" in tokens and "refresh_token" in tokens

    me = await client.get("/v1/auth/me", headers=auth_h(tokens["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == user["email"]


async def test_wrong_password_rejected(client, user):
    res = await client.post("/v1/auth/login", json={"email": user["email"], "password": "wrong"})
    assert res.status_code in (400, 401, 403)


async def test_refresh_rotation(client, user):
    res = await client.post("/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
    assert res.status_code == 200, res.text
    new = res.json()
    assert new["refresh_token"] != user["refresh_token"]

    # Re-use of old refresh token must fail (revokes family).
    again = await client.post("/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
    assert again.status_code in (400, 401, 403)


async def test_me_without_token_rejected(client):
    res = await client.get("/v1/auth/me")
    assert res.status_code in (401, 403)
