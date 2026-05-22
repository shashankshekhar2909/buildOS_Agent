from __future__ import annotations

import asyncio
import base64
import json
import os
import urllib.parse
import urllib.request
from typing import Any

from skill_sdk import Skill, SkillManifest

GMAIL_API = "https://gmail.googleapis.com/gmail/v1"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def _json_request(url: str, method: str = "GET", headers: dict[str, str] | None = None, body: dict[str, Any] | None = None) -> dict[str, Any]:
    req_headers = {"accept": "application/json"}
    if headers:
        req_headers.update(headers)
    data = None
    if body is not None:
        req_headers["content-type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as res:
        payload = res.read().decode("utf-8")
    return json.loads(payload) if payload else {}


def _refresh_access_token(refresh_token: str, client_id: str | None, client_secret: str | None) -> str:
    body = {"grant_type": "refresh_token", "refresh_token": refresh_token}
    if client_id:
        body["client_id"] = client_id
    if client_secret:
        body["client_secret"] = client_secret
    data = _json_request(TOKEN_URL, method="POST", body=body)
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"google token refresh failed: {data}")
    return str(token)


def _gmail_get(path: str, access_token: str) -> dict[str, Any]:
    return _json_request(
        f"{GMAIL_API}{path}",
        headers={"authorization": f"Bearer {access_token}"},
    )


def _gmail_list(access_token: str, query: str | None, max_results: int) -> dict[str, Any]:
    qs = {"maxResults": str(max_results)}
    if query:
        qs["q"] = query
    return _gmail_get(f"/users/me/messages?{urllib.parse.urlencode(qs)}", access_token)


def _decode_b64url(data: str | None) -> str:
    if not data:
        return ""
    padded = data.replace("-", "+").replace("_", "/")
    padded = padded + "=" * ((4 - len(padded) % 4) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8", errors="replace")


def _walk_parts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    parts = [payload]
    for part in payload.get("parts", []) or []:
        parts.extend(_walk_parts(part))
    return parts


def _pick_header(headers: list[dict[str, Any]], name: str) -> str | None:
    lower = name.lower()
    for header in headers:
        if str(header.get("name", "")).lower() == lower:
            return str(header.get("value", ""))
    return None


def _extract_message(message: dict[str, Any]) -> dict[str, Any]:
    payload = message.get("payload") or {}
    headers = list(payload.get("headers", []) or [])
    parts = _walk_parts(payload)
    body_text = ""
    html_text = ""
    for part in parts:
        mime = str(part.get("mimeType", "")).lower()
        body = part.get("body") or {}
        text = _decode_b64url(body.get("data"))
        if mime == "text/plain" and text and not body_text:
            body_text = text
        elif mime == "text/html" and text and not html_text:
            html_text = text
    if not body_text and not html_text:
        body_text = _decode_b64url((payload.get("body") or {}).get("data"))
    return {
        "id": message.get("id"),
        "thread_id": message.get("threadId"),
        "label_ids": list(message.get("labelIds", []) or []),
        "snippet": message.get("snippet", ""),
        "from": _pick_header(headers, "from"),
        "to": _pick_header(headers, "to"),
        "subject": _pick_header(headers, "subject"),
        "date": _pick_header(headers, "date"),
        "body_text": body_text,
        "body_html": html_text,
    }


def _resolve_token(payload: dict[str, Any]) -> str:
    access_token = str(payload.get("access_token") or os.environ.get("GMAIL_ACCESS_TOKEN") or "").strip()
    if access_token:
        return access_token

    refresh_token = str(payload.get("refresh_token") or os.environ.get("GMAIL_REFRESH_TOKEN") or "").strip()
    if not refresh_token:
        raise RuntimeError("gmail requires access_token or refresh_token")

    client_id = str(payload.get("client_id") or os.environ.get("GMAIL_CLIENT_ID") or "").strip() or None
    client_secret = str(payload.get("client_secret") or os.environ.get("GMAIL_CLIENT_SECRET") or "").strip() or None
    return _refresh_access_token(refresh_token, client_id, client_secret)


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "list").strip().lower()
    max_results = max(1, min(int(payload.get("max_results", 10) or 10), 25))

    def _run() -> dict[str, Any]:
        token = _resolve_token(payload)
        profile = _gmail_get("/users/me/profile", token)

        if op == "profile":
            return {"ok": True, "profile": profile}

        if op == "list":
            query = str(payload.get("query") or payload.get("q") or "").strip() or None
            data = _gmail_list(token, query, max_results)
            messages = []
            for row in data.get("messages", []) or []:
                msg = _gmail_get(f"/users/me/messages/{row['id']}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date", token)
                messages.append(_extract_message(msg))
            return {
                "ok": True,
                "account": profile.get("emailAddress"),
                "result_count": len(messages),
                "messages": messages,
                "next_page_token": data.get("nextPageToken"),
            }

        if op == "read":
            message_id = str(payload.get("message_id") or "").strip()
            if not message_id:
                raise RuntimeError("gmail read requires message_id")
            format_ = str(payload.get("format") or "full").strip().lower()
            msg = _gmail_get(f"/users/me/messages/{urllib.parse.quote(message_id)}?format={urllib.parse.quote(format_)}", token)
            return {"ok": True, "account": profile.get("emailAddress"), "message": _extract_message(msg), "raw": msg}

        if op == "search":
            query = str(payload.get("query") or payload.get("q") or "").strip()
            if not query:
                raise RuntimeError("gmail search requires query")
            data = _gmail_list(token, query, max_results)
            return {
                "ok": True,
                "account": profile.get("emailAddress"),
                "result_count": len(data.get("messages", []) or []),
                "messages": data.get("messages", []) or [],
                "next_page_token": data.get("nextPageToken"),
            }

        raise RuntimeError(f"unsupported gmail op '{op}'")

    return await asyncio.to_thread(_run)


skill = Skill(
    manifest=SkillManifest(
        name="gmail",
        description="Read Gmail via OAuth refresh token or access token.",
        permissions=["gmail.readonly"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["profile", "list", "read", "search"]},
            "access_token": {"type": "string"},
            "refresh_token": {"type": "string"},
            "client_id": {"type": "string"},
            "client_secret": {"type": "string"},
            "query": {"type": "string"},
            "message_id": {"type": "string"},
            "format": {"type": "string", "enum": ["full", "metadata", "minimal", "raw"]},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 25},
        },
    ),
    handler=handle,
)
