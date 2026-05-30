from __future__ import annotations

import os
from pathlib import Path

from skill_sdk import Skill, SkillManifest

ROOT = Path(os.getenv("BUILDAGENT_WORKSPACE_ROOT", "/home/shashank/project/buildOsAgent/.buildagent-files")).resolve()
ROOT.mkdir(parents=True, exist_ok=True)


def _safe_path(raw: str) -> Path:
    target = (ROOT / raw.lstrip("/")).resolve()
    if ROOT not in target.parents and target != ROOT:
        raise ValueError("path escapes root")
    return target


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or payload.get("action") or "").strip().lower()
    if op in {"ls", "dir"}:
        op = "list"
    elif op in {"cat", "show", "open"}:
        op = "read"
    elif not op:
        if payload.get("content") is not None or payload.get("contents") is not None:
            op = "write"
        elif payload.get("recursive") is not None or payload.get("path") is not None:
            op = "list"

    try:
        if op == "list":
            path = _safe_path(str(payload.get("path", ".")))
            if not path.exists():
                return {"ok": False, "error": "path not found"}
            if path.is_file():
                return {"ok": True, "entries": [], "path": str(path), "is_file": True}
            entries = []
            for item in sorted(path.iterdir()):
                entries.append(
                    {
                        "name": item.name,
                        "path": str(item.relative_to(ROOT)),
                        "kind": "dir" if item.is_dir() else "file",
                        "size": item.stat().st_size,
                    }
                )
            return {"ok": True, "entries": entries, "path": str(path.relative_to(ROOT))}

        if op == "read":
            path = _safe_path(str(payload.get("path", "")))
            if not path.exists() or not path.is_file():
                return {"ok": False, "error": "file not found"}
            return {"ok": True, "path": str(path.relative_to(ROOT)), "content": path.read_text()}

        if op == "write":
            path = _safe_path(str(payload.get("path", "")))
            content = str(payload.get("content") if payload.get("content") is not None else payload.get("contents", ""))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            return {"ok": True, "path": str(path.relative_to(ROOT)), "bytes": len(content.encode())}

        if op == "delete":
            path = _safe_path(str(payload.get("path", "")))
            if path.is_dir():
                for child in sorted(path.rglob("*"), reverse=True):
                    if child.is_file():
                        child.unlink()
                    elif child.is_dir():
                        child.rmdir()
                path.rmdir()
            elif path.exists():
                path.unlink()
            else:
                return {"ok": False, "error": "path not found"}
            return {"ok": True, "deleted": str(path.relative_to(ROOT))}

        return {"ok": False, "error": f"unknown op {op}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


skill = Skill(
        manifest=SkillManifest(
            name="filesystem",
            version="1.0.0",
            description=f"Safe path-restricted file operations under {ROOT}.",
            permissions=["fs:read", "fs:write"],
            requires_approval=True,
            risk="high",
            execution="local",
            schema={
            "type": "object",
            "properties": {
                "op": {"type": "string", "enum": ["list", "read", "write", "delete"]},
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["op", "path"],
        },
    ),
    handler=handle,
)
