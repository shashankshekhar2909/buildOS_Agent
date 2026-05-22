from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from skill_sdk import Skill, SkillManifest

SLACK_API = "https://slack.com/api"


def _request(base_url: str, token: str, path: str, method: str = "GET", body: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
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


def _resolve_config(payload: dict[str, Any]) -> dict[str, str]:
    token = str(payload.get("bot_token") or payload.get("access_token") or os.environ.get("SLACK_BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("slack requires bot_token")
    base_url = str(payload.get("base_url") or os.environ.get("SLACK_API_BASE") or SLACK_API).strip()
    channel_id = str(payload.get("channel_id") or payload.get("default_channel_id") or "").strip()
    return {"token": token, "base_url": base_url, "channel_id": channel_id}


def _message_summary(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "ts": message.get("ts"),
        "channel": message.get("channel"),
        "text": message.get("text"),
        "user": message.get("user"),
        "bot_id": message.get("bot_id"),
    }


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "send_text").strip().lower()

    def _run() -> dict[str, Any]:
        cfg = _resolve_config(payload)

        if op == "me":
            data = _request(cfg["base_url"], cfg["token"], "auth.test")
            return {
                "ok": True,
                "auth": {
                    "url": data.get("url"),
                    "team": data.get("team"),
                    "user": data.get("user"),
                    "team_id": data.get("team_id"),
                    "user_id": data.get("user_id"),
                    "bot_id": data.get("bot_id"),
                },
            }

        if op == "send_text":
            text = str(payload.get("message") or payload.get("text") or "").strip()
            channel_id = str(payload.get("channel_id") or cfg["channel_id"]).strip()
            if not channel_id:
                raise RuntimeError("slack send_text requires channel_id")
            if not text:
                raise RuntimeError("slack send_text requires message")
            result = _request(
                cfg["base_url"],
                cfg["token"],
                "chat.postMessage",
                method="POST",
                body={"channel": channel_id, "text": text},
            )
            return {"ok": True, "message": _message_summary(result.get("message") or {}), "raw": result}

        if op == "history":
            channel_id = str(payload.get("channel_id") or cfg["channel_id"]).strip()
            if not channel_id:
                raise RuntimeError("slack history requires channel_id")
            params = {"channel": channel_id, "limit": str(max(1, min(200, int(payload.get("limit", 20) or 20))))}
            cursor = str(payload.get("cursor") or "").strip()
            if cursor:
                params["cursor"] = cursor
            if str(payload.get("inclusive") or "").lower() in {"1", "true", "yes"}:
                params["inclusive"] = "true"
            url = f"conversations.history?{urllib.parse.urlencode(params)}"
            result = _request(cfg["base_url"], cfg["token"], url)
            messages = result.get("messages") or []
            return {
                "ok": True,
                "message_count": len(messages),
                "has_more": bool(result.get("has_more")),
                "next_cursor": ((result.get("response_metadata") or {}).get("next_cursor") or ""),
                "messages": messages,
            }

        raise RuntimeError(f"unsupported slack op '{op}'")

    try:
        return await asyncio.to_thread(_run)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": f"slack api error {exc.code}", "details": detail}


skill = Skill(
    manifest=SkillManifest(
        name="slack",
        description="Slack bot connector for user-registered bots.",
        permissions=["slack.bot"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["me", "send_text", "history"]},
            "bot_token": {"type": "string"},
            "channel_id": {"type": "string"},
            "default_channel_id": {"type": "string"},
            "message": {"type": "string"},
            "text": {"type": "string"},
            "base_url": {"type": "string"},
            "limit": {"type": "integer"},
            "cursor": {"type": "string"},
            "inclusive": {"type": "boolean"},
        },
    ),
    handler=handle,
)
