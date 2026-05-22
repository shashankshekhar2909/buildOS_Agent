"""Integration test fixtures.

Tests hit the live api-gateway at http://127.0.0.1:8800. Each test gets a
fresh user (random email) so state is isolated without DB teardown.

Run:
    pip install -r tests/requirements.txt
    pytest tests
"""
from __future__ import annotations

import os
import secrets
from typing import AsyncIterator

import httpx
import pytest

API_URL = os.environ.get("BUILDAGENT_API_URL", "http://127.0.0.1:8800")


@pytest.fixture(scope="session")
def api_url() -> str:
    return API_URL


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(base_url=API_URL, timeout=30) as c:
        yield c


def _rand_email() -> str:
    # email-validator rejects .test / .invalid; example.com is RFC reserved + permitted.
    return f"test-{secrets.token_hex(6)}@example.com"


@pytest.fixture
async def user(client: httpx.AsyncClient) -> dict:
    """Fresh registered user. Returns {email, password, access_token, refresh_token, id, role}."""
    email = _rand_email()
    password = "test-password-1234"
    res = await client.post("/v1/auth/register", json={"email": email, "password": password})
    assert res.status_code in (200, 201), res.text
    tokens = res.json()
    me_res = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me_res.status_code == 200, me_res.text
    me = me_res.json()
    return {
        "email": email,
        "password": password,
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "id": me["id"],
        "role": me["role"],
    }


@pytest.fixture
async def admin(client: httpx.AsyncClient) -> dict:
    """Bootstrap admin login. Uses BOOTSTRAP_ADMIN_* env or known defaults."""
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com")
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "password123")
    res = await client.post("/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code in (200, 201), res.text
    tokens = res.json()
    me_res = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    me = me_res.json()
    return {
        "email": email,
        "password": password,
        "access_token": tokens["access_token"],
        "id": me["id"],
        "role": me["role"],
    }


def auth_h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
