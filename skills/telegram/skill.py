from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from skill_sdk import Skill, SkillManifest

TG_API = "https://api.telegram.org"


def _request(base_url: str, token: str, path: str, method: str = "GET", body: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/bot{token}/{path.lstrip('/')}"
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


def _resolve_config(payload: dict[str, Any]) -> dict[str, str]:
    token = str(payload.get("bot_token") or payload.get("access_token") or os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("telegram requires bot_token")
    base_url = str(payload.get("base_url") or os.environ.get("TELEGRAM_API_BASE") or TG_API).strip()
    chat_id = str(payload.get("chat_id") or payload.get("default_chat_id") or "").strip()
    return {"token": token, "base_url": base_url, "chat_id": chat_id}


def _message_summary(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "message_id": message.get("message_id"),
        "chat_id": (message.get("chat") or {}).get("id"),
        "text": message.get("text"),
        "date": message.get("date"),
        "from": ((message.get("from") or {}).get("username") or (message.get("from") or {}).get("first_name")),
    }


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "send_text").strip().lower()

    def _run() -> dict[str, Any]:
        cfg = _resolve_config(payload)

        if op == "me":
            bot = _request(cfg["base_url"], cfg["token"], "getMe")
            return {
                "ok": True,
                "bot": {
                    "id": bot.get("id"),
                    "is_bot": bot.get("is_bot"),
                    "first_name": bot.get("first_name"),
                    "username": bot.get("username"),
                    "can_join_groups": bot.get("can_join_groups"),
                    "can_read_all_group_messages": bot.get("can_read_all_group_messages"),
                    "supports_inline_queries": bot.get("supports_inline_queries"),
                },
            }

        if op == "send_text":
            message = str(payload.get("message") or payload.get("text") or "").strip()
            chat_id = str(payload.get("chat_id") or cfg["chat_id"]).strip()
            if not chat_id:
                raise RuntimeError("telegram send_text requires chat_id")
            if not message:
                raise RuntimeError("telegram send_text requires message")
            result = _request(
                cfg["base_url"],
                cfg["token"],
                "sendMessage",
                method="POST",
                body={"chat_id": chat_id, "text": message},
            )
            return {"ok": True, "message": _message_summary(result), "raw": result}

        if op == "get_updates":
            params = {"timeout": str(max(0, int(payload.get("timeout", 0) or 0)))}
            offset = payload.get("offset")
            limit = payload.get("limit")
            if offset is not None and str(offset).strip():
                params["offset"] = str(offset)
            if limit is not None and str(limit).strip():
                params["limit"] = str(limit)
            data = _request(
                cfg["base_url"],
                cfg["token"],
                f"getUpdates?{urllib.parse.urlencode(params)}",
            )
            return {"ok": True, "result_count": len(data), "updates": data}

        raise RuntimeError(f"unsupported telegram op '{op}'")

    try:
        return await asyncio.to_thread(_run)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": f"telegram api error {exc.code}", "details": detail}


skill = Skill(
    manifest=SkillManifest(
        name="telegram",
        description="Telegram bot connector for user-registered bots.",
        permissions=["telegram.bot"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["me", "send_text", "get_updates"]},
            "bot_token": {"type": "string"},
            "chat_id": {"type": "string"},
            "default_chat_id": {"type": "string"},
            "message": {"type": "string"},
            "text": {"type": "string"},
            "base_url": {"type": "string"},
            "offset": {"type": "integer"},
            "limit": {"type": "integer"},
            "timeout": {"type": "integer"},
        },
    ),
    handler=handle,
)
