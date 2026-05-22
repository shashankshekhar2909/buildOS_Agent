from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from skill_sdk import Skill, SkillManifest

STORE = Path("/tmp/buildagent-notes.json")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_notes() -> list[dict]:
    if not STORE.exists():
        return []
    try:
        return json.loads(STORE.read_text())
    except Exception:
        return []


def _save_notes(notes: list[dict]) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(notes, indent=2, sort_keys=True))


async def handle(payload: dict) -> dict:
    op = payload.get("op", "list")
    notes = _load_notes()

    if op == "list":
        return {"ok": True, "notes": notes}

    if op == "search":
        term = str(payload.get("query", "")).strip().lower()
        results = [
            note
            for note in notes
            if term in note.get("title", "").lower()
            or term in note.get("body", "").lower()
            or term in " ".join(note.get("tags", [])).lower()
        ]
        return {"ok": True, "notes": results, "query": term}

    if op == "add":
        title = str(payload.get("title", "")).strip()
        body = str(payload.get("body", "")).strip()
        if not title:
            return {"ok": False, "error": "title required"}
        note = {
            "id": str(uuid4()),
            "title": title,
            "body": body,
            "tags": list(payload.get("tags", [])),
            "created_at": _now(),
            "updated_at": _now(),
        }
        notes.insert(0, note)
        _save_notes(notes)
        return {"ok": True, "note": note}

    note_id = str(payload.get("id", "")).strip()
    if not note_id:
        return {"ok": False, "error": "id required"}

    index = next((i for i, note in enumerate(notes) if note.get("id") == note_id), None)
    if index is None:
        return {"ok": False, "error": "note not found"}

    if op == "get":
        return {"ok": True, "note": notes[index]}

    if op == "update":
        note = notes[index]
        if "title" in payload:
            note["title"] = str(payload["title"]).strip()
        if "body" in payload:
            note["body"] = str(payload["body"]).strip()
        if "tags" in payload:
            note["tags"] = list(payload.get("tags", []))
        note["updated_at"] = _now()
        _save_notes(notes)
        return {"ok": True, "note": note}

    if op == "delete":
        note = notes.pop(index)
        _save_notes(notes)
        return {"ok": True, "deleted": note}

    return {"ok": False, "error": f"unknown op {op}"}


skill = Skill(
    manifest=SkillManifest(
        name="notes",
        version="1.0.0",
        description="Create, search, update, and delete local notes.",
        permissions=["notes:read", "notes:write"],
        requires_approval=False,
        risk="low",
        execution="local",
        schema={
            "type": "object",
            "properties": {
                "op": {"type": "string", "enum": ["list", "search", "add", "get", "update", "delete"]},
                "id": {"type": "string"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "query": {"type": "string"},
            },
            "required": ["op"],
        },
    ),
    handler=handle,
)
