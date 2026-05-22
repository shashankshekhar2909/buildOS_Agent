from __future__ import annotations

import asyncio
import json
import os
import urllib.parse
import urllib.request
from typing import Any

from skill_sdk import Skill, SkillManifest

CALENDAR_API = "https://www.googleapis.com/calendar/v3"
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


def _calendar_get(path: str, access_token: str) -> dict[str, Any]:
    return _json_request(
        f"{CALENDAR_API}{path}",
        headers={"authorization": f"Bearer {access_token}"},
    )


def _resolve_token(payload: dict[str, Any]) -> str:
    access_token = str(payload.get("access_token") or os.environ.get("CALENDAR_ACCESS_TOKEN") or "").strip()
    if access_token:
        return access_token

    refresh_token = str(payload.get("refresh_token") or os.environ.get("CALENDAR_REFRESH_TOKEN") or "").strip()
    if not refresh_token:
        raise RuntimeError("calendar requires access_token or refresh_token")

    client_id = str(payload.get("client_id") or os.environ.get("CALENDAR_CLIENT_ID") or "").strip() or None
    client_secret = str(payload.get("client_secret") or os.environ.get("CALENDAR_CLIENT_SECRET") or "").strip() or None
    return _refresh_access_token(refresh_token, client_id, client_secret)


def _parse_dt(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "list").strip().lower()
    calendar_id = str(payload.get("calendar_id") or "primary").strip() or "primary"

    def _run() -> dict[str, Any]:
        token = _resolve_token(payload)

        if op == "list":
            params: dict[str, str] = {
                "maxResults": str(max(1, min(int(payload.get("max_results", 10) or 10), 25))),
                "singleEvents": "true",
                "orderBy": "startTime",
            }
            time_min = _parse_dt(payload.get("time_min"))
            time_max = _parse_dt(payload.get("time_max"))
            query = str(payload.get("query") or "").strip()
            if time_min:
                params["timeMin"] = time_min
            if time_max:
                params["timeMax"] = time_max
            if query:
                params["q"] = query
            data = _calendar_get(f"/calendars/{urllib.parse.quote(calendar_id)}/events?{urllib.parse.urlencode(params)}", token)
            return {
                "ok": True,
                "calendar_id": calendar_id,
                "result_count": len(data.get("items", []) or []),
                "events": [_simplify_event(item) for item in data.get("items", []) or []],
                "next_page_token": data.get("nextPageToken"),
                "time_min": time_min,
                "time_max": time_max,
            }

        if op == "get":
            event_id = str(payload.get("event_id") or "").strip()
            if not event_id:
                raise RuntimeError("calendar get requires event_id")
            data = _calendar_get(
                f"/calendars/{urllib.parse.quote(calendar_id)}/events/{urllib.parse.quote(event_id)}",
                token,
            )
            return {"ok": True, "calendar_id": calendar_id, "event": _simplify_event(data), "raw": data}

        raise RuntimeError(f"unsupported calendar op '{op}'")

    return await asyncio.to_thread(_run)


def _simplify_event(event: dict[str, Any]) -> dict[str, Any]:
    start = event.get("start") or {}
    end = event.get("end") or {}
    return {
        "id": event.get("id"),
        "status": event.get("status"),
        "summary": event.get("summary"),
        "description": event.get("description"),
        "location": event.get("location"),
        "html_link": event.get("htmlLink"),
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "attendees": len(event.get("attendees", []) or []),
        "organizer": (event.get("organizer") or {}).get("email"),
    }


skill = Skill(
    manifest=SkillManifest(
        name="calendar",
        description="Read Google Calendar events via OAuth refresh token or access token.",
        permissions=["calendar.readonly"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["list", "get"]},
            "calendar_id": {"type": "string", "default": "primary"},
            "event_id": {"type": "string"},
            "time_min": {"type": "string", "format": "date-time"},
            "time_max": {"type": "string", "format": "date-time"},
            "query": {"type": "string"},
            "access_token": {"type": "string"},
            "refresh_token": {"type": "string"},
            "client_id": {"type": "string"},
            "client_secret": {"type": "string"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 25},
        },
    ),
    handler=handle,
)
