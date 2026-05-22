from __future__ import annotations

from pathlib import Path

from skill_sdk import Skill, SkillManifest

ROOT = Path("/tmp/buildagent-files").resolve()


def _safe_path(raw: str) -> Path:
    target = (ROOT / raw.lstrip("/")).resolve()
    if ROOT not in target.parents and target != ROOT:
        raise ValueError("path escapes root")
    return target


async def handle(payload: dict) -> dict:
    op = payload.get("op")

    try:
        if op == "list":
            path = _safe_path(str(payload.get("path", "")))
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
            content = str(payload.get("content", ""))
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
            description="Safe path-restricted file operations under /tmp/buildagent-files.",
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
