"""Bridge: skills/*/skill.py -> agent Tool list.

Discovers Skill objects on disk via runpy and wraps each as a Tool the agent
can call. Mirrors services/api-gateway/app/skill_runtime.py.
"""
from __future__ import annotations

import runpy
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

from agent_runtime.agent import Tool


def _repo_root() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "skills").exists() and (parent / "packages").exists():
            return parent
    return None


def _ensure_path() -> None:
    root = _repo_root()
    if root is None:
        return
    for candidate in (root / "packages" / "skill-sdk", root):
        if candidate.exists() and str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))


_ensure_path()

from skill_sdk import Skill  # noqa: E402


@lru_cache(maxsize=1)
def _skill_registry() -> dict[str, Skill]:
    root = _repo_root()
    if root is None:
        return {}
    _ensure_path()
    reg: dict[str, Skill] = {}
    for skill_file in sorted((root / "skills").glob("*/skill.py")):
        namespace = runpy.run_path(str(skill_file))
        obj = namespace.get("skill")
        if isinstance(obj, Skill):
            reg[obj.manifest.name] = obj
    return reg


def _wrap(skill: Skill) -> Tool:
    async def handler(args: dict[str, Any]) -> Any:
        result = await skill.run(args)
        return result if isinstance(result, dict) else {"ok": True, "result": result}

    return Tool(
        name=f"skill_{skill.manifest.name}",
        description=skill.manifest.description or skill.manifest.name,
        schema=skill.manifest.schema or {"type": "object", "properties": {}},
        handler=handler,
        requires_approval=bool(getattr(skill.manifest, "requires_approval", False)),
    )


def load_skill_tools(allow: list[str] | None = None, deny: list[str] | None = None) -> list[Tool]:
    """Return Tool wrappers for discovered skills.

    allow: if set, only include these skill names.
    deny: if set, exclude these skill names.
    """
    reg = _skill_registry()
    tools: list[Tool] = []
    for name, skill in reg.items():
        if allow is not None and name not in allow:
            continue
        if deny is not None and name in deny:
            continue
        tools.append(_wrap(skill))
    return tools
