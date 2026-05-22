from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user
from app.connector_store import delete_user_secret, get_user_secret, upsert_user_secret
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/v1/connectors", tags=["connectors"])


class TelegramUpsertIn(BaseModel):
    bot_token: str = Field(min_length=1)
    default_chat_id: str | None = None


class TelegramOut(BaseModel):
    registered: bool
    bot_name: str | None = None
    bot_username: str | None = None
    default_chat_id: str | None = None


class SlackUpsertIn(BaseModel):
    bot_token: str = Field(min_length=1)
    default_channel_id: str | None = None


class SlackOut(BaseModel):
    registered: bool
    team: str | None = None
    user: str | None = None
    default_channel_id: str | None = None


def _telegram_api(path: str, token: str, method: str = "GET", body: dict | None = None) -> dict:
    url = f"https://api.telegram.org/bot{token}/{path.lstrip('/')}"
    headers = {"accept": "application/json"}
    data = None
    if body is not None:
        headers["content-type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read().decode("utf-8")
    payload = json.loads(raw) if raw else {}
    if not payload.get("ok", False):
        raise RuntimeError(str(payload))
    return payload.get("result") or {}


def _slack_api(path: str, token: str, method: str = "GET", body: dict | None = None) -> dict:
    url = f"https://slack.com/api/{path.lstrip('/')}"
    headers = {
        "accept": "application/json",
        "authorization": f"Bearer {token}",
    }
    data = None
    if body is not None:
        headers["content-type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read().decode("utf-8")
    payload = json.loads(raw) if raw else {}
    if not payload.get("ok", False):
        raise RuntimeError(str(payload))
    return payload


@router.get("/telegram", response_model=TelegramOut)
async def get_telegram(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> TelegramOut:
    secret = await get_user_secret(db, user.id, "telegram")
    if not secret:
        return TelegramOut(registered=False)
    token = str(secret.get("bot_token") or "")
    if not token:
        return TelegramOut(registered=False)
    try:
        bot = _telegram_api("getMe", token)
    except Exception:
        return TelegramOut(registered=False)
    return TelegramOut(
        registered=True,
        bot_name=bot.get("first_name"),
        bot_username=bot.get("username"),
        default_chat_id=secret.get("default_chat_id"),
    )


@router.put("/telegram", response_model=TelegramOut)
async def upsert_telegram(
    body: TelegramUpsertIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> TelegramOut:
    try:
        bot = _telegram_api("getMe", body.bot_token)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail) from exc
    await upsert_user_secret(
        db,
        user.id,
        "telegram",
        {"bot_token": body.bot_token, "default_chat_id": body.default_chat_id or None},
    )
    await db.commit()
    return TelegramOut(
        registered=True,
        bot_name=bot.get("first_name"),
        bot_username=bot.get("username"),
        default_chat_id=body.default_chat_id or None,
    )


@router.delete("/telegram", status_code=status.HTTP_204_NO_CONTENT)
async def delete_telegram(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> None:
    await delete_user_secret(db, user.id, "telegram")
    await db.commit()


@router.get("/slack", response_model=SlackOut)
async def get_slack(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> SlackOut:
    secret = await get_user_secret(db, user.id, "slack")
    if not secret:
        return SlackOut(registered=False)
    token = str(secret.get("bot_token") or "")
    if not token:
        return SlackOut(registered=False)
    try:
        data = _slack_api("auth.test", token)
    except Exception:
        return SlackOut(registered=False)
    return SlackOut(
        registered=True,
        team=data.get("team"),
        user=data.get("user"),
        default_channel_id=secret.get("default_channel_id"),
    )


@router.put("/slack", response_model=SlackOut)
async def upsert_slack(
    body: SlackUpsertIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> SlackOut:
    try:
        data = _slack_api("auth.test", body.bot_token)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail) from exc
    await upsert_user_secret(
        db,
        user.id,
        "slack",
        {"bot_token": body.bot_token, "default_channel_id": body.default_channel_id or None},
    )
    await db.commit()
    return SlackOut(
        registered=True,
        team=data.get("team"),
        user=data.get("user"),
        default_channel_id=body.default_channel_id or None,
    )


@router.delete("/slack", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slack(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> None:
    await delete_user_secret(db, user.id, "slack")
    await db.commit()
