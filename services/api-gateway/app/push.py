"""Expo Push API sender.

Sends a single notification to one or many Expo push tokens. The HTTP
endpoint accepts unauthenticated calls (rate-limited by Expo). Failures
are swallowed and logged — push is best-effort, never blocks the
business flow that triggered it.

https://docs.expo.dev/push-notifications/sending-notifications/
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)
PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH = 100  # Expo accepts up to 100 messages per request


def _is_expo_token(t: str) -> bool:
    return t.startswith("ExponentPushToken[") or t.startswith("ExpoPushToken[")


async def send_push(
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    sound: str | None = "default",
    priority: str = "high",
) -> dict:
    """Send a push to N tokens. Returns Expo response summary or error dict."""
    expo_tokens = [t for t in tokens if _is_expo_token(t)]
    if not expo_tokens:
        return {"ok": False, "error": "no valid expo tokens", "sent": 0}

    messages = [
        {"to": t, "title": title, "body": body, "data": data or {}, "sound": sound, "priority": priority}
        for t in expo_tokens
    ]

    sent = 0
    errors: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for i in range(0, len(messages), MAX_BATCH):
                chunk = messages[i : i + MAX_BATCH]
                res = await client.post(PUSH_URL, json=chunk, headers={"accept": "application/json", "content-type": "application/json"})
                if res.status_code >= 400:
                    errors.append(f"{res.status_code}: {res.text[:200]}")
                    continue
                sent += len(chunk)
    except Exception as exc:
        log.warning("expo push failed: %s", exc)
        return {"ok": False, "error": str(exc), "sent": sent}

    return {"ok": not errors, "sent": sent, "errors": errors}
