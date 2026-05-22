from __future__ import annotations

import runpy
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any


def _repo_root() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "skills").exists():
            return parent
    return None


def _skill_roots() -> list[Path]:
    root = _repo_root()
    if root is None:
        return []
    return [root / "packages" / "skill-sdk", root]


def _ensure_path() -> None:
    for candidate in reversed(_skill_roots()):
        if candidate.exists() and str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))


_ensure_path()

from skill_sdk import Skill  # noqa: E402


@lru_cache(maxsize=1)
def _registry() -> dict[str, Skill]:
    root = _repo_root()
    if root is None:
        return {}
    _ensure_path()
    reg: dict[str, Skill] = {}
    for skill_file in sorted((root / "skills").glob("*/skill.py")):
        namespace = runpy.run_path(str(skill_file))
        skill_obj = namespace.get("skill")
        if isinstance(skill_obj, Skill):
            reg[skill_obj.manifest.name] = skill_obj
    return reg


def load_skill(name: str) -> Skill | None:
    return _registry().get(name)


def normalize_payload(payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValueError("skill task requires payload.name")
    raw = payload.get("payload")
    if isinstance(raw, dict):
        return name, raw
    return name, {k: v for k, v in payload.items() if k != "name"}


async def run_skill(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    skill = load_skill(name)
    if not skill:
        return {"ok": False, "error": f"skill handler not found for '{name}'"}
    try:
        result = await skill.run(payload)
    except Exception as exc:  # pragma: no cover - defensive guard
        return {"ok": False, "error": str(exc)}
    if isinstance(result, dict):
        return result
    return {"ok": True, "result": result}
