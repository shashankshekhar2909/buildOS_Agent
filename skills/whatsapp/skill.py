from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from skill_sdk import Skill, SkillManifest

GRAPH_BASE = "https://graph.facebook.com"


def _request(url: str, token: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def _resolve_config(payload: dict[str, Any]) -> dict[str, str]:
    access_token = str(payload.get("access_token") or os.environ.get("WHATSAPP_ACCESS_TOKEN") or "").strip()
    phone_number_id = str(payload.get("phone_number_id") or os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    recipient = str(payload.get("to") or payload.get("recipient") or "").strip()
    version = str(payload.get("version") or os.environ.get("WHATSAPP_GRAPH_VERSION") or "v20.0").strip()
    if not access_token:
        raise RuntimeError("whatsapp requires access_token")
    if not phone_number_id:
        raise RuntimeError("whatsapp requires phone_number_id")
    return {
        "access_token": access_token,
        "phone_number_id": phone_number_id,
        "recipient": recipient,
        "version": version,
    }


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "send_text").strip().lower()

    if op != "send_text":
        raise RuntimeError(f"unsupported whatsapp op '{op}'")

    def _run() -> dict[str, Any]:
        cfg = _resolve_config(payload)
        message = str(payload.get("message") or payload.get("body") or "").strip()
        if not cfg["recipient"]:
            raise RuntimeError("whatsapp send_text requires recipient")
        if not message:
            raise RuntimeError("whatsapp send_text requires message")
        url = f"{GRAPH_BASE}/{cfg['version']}/{cfg['phone_number_id']}/messages"
        body = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": cfg["recipient"],
            "type": "text",
            "text": {"body": message},
        }
        data = _request(url, cfg["access_token"], body)
        return {
            "ok": True,
            "message_id": data.get("messages", [{}])[0].get("id"),
            "raw": data,
            "recipient": cfg["recipient"],
            "phone_number_id": cfg["phone_number_id"],
            "version": cfg["version"],
        }

    try:
        return await asyncio.to_thread(_run)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": f"whatsapp api error {exc.code}", "details": detail}


skill = Skill(
    manifest=SkillManifest(
        name="whatsapp",
        description="Send WhatsApp Cloud API text messages.",
        permissions=["whatsapp.send"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["send_text"]},
            "access_token": {"type": "string"},
            "phone_number_id": {"type": "string"},
            "recipient": {"type": "string"},
            "message": {"type": "string"},
            "version": {"type": "string"},
        },
    ),
    handler=handle,
)
