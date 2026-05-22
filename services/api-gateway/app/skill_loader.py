from __future__ import annotations

import runpy
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Skill


@dataclass(slots=True)
class DiscoveredSkill:
    name: str
    version: str
    description: str
    permissions: list[str]
    requires_approval: bool
    risk: str
    schema: dict[str, Any]
    execution: str
    enabled: bool
    source: str


def _skill_roots() -> list[Path]:
    here = Path(__file__).resolve()
    roots: list[Path] = []
    for parent in here.parents:
        if (parent / "skills").exists():
            roots.append(parent / "packages" / "skill-sdk")
            roots.append(parent)
            break
    return [candidate for candidate in roots if candidate.exists()]


def discover_skills() -> list[DiscoveredSkill]:
    root = next((parent for parent in Path(__file__).resolve().parents if (parent / "skills").exists()), None)
    if root is None:
        return []
    skills_dir = root / "skills"
    discovered: list[DiscoveredSkill] = []

    if not skills_dir.exists():
        return discovered

    for sdk_root in reversed(_skill_roots()):
        if str(sdk_root) not in sys.path:
            sys.path.insert(0, str(sdk_root))

    for skill_file in sorted(skills_dir.glob("*/skill.py")):
        namespace = runpy.run_path(str(skill_file))
        skill_obj = namespace.get("skill")
        if skill_obj is None:
            continue
        manifest = skill_obj.manifest
        discovered.append(
            DiscoveredSkill(
                name=manifest.name,
                version=getattr(manifest, "version", "0.1.0"),
                description=getattr(manifest, "description", ""),
                permissions=list(getattr(manifest, "permissions", [])),
                requires_approval=bool(getattr(manifest, "requires_approval", True)),
                risk=str(getattr(manifest, "risk", "medium")),
                schema=dict(getattr(manifest, "schema", {})),
                execution=str(getattr(manifest, "execution", "local")),
                enabled=True,
                source=str(skill_file.relative_to(root)),
            )
        )
    return discovered


async def sync_skill_catalog(db: AsyncSession) -> list[Skill]:
    synced: list[Skill] = []
    for item in discover_skills():
        existing = (await db.execute(select(Skill).where(Skill.name == item.name))).scalar_one_or_none()
        if existing:
            existing.version = item.version
            existing.description = item.description
            existing.manifest = {
                "permissions": item.permissions,
                "requires_approval": item.requires_approval,
                "risk": item.risk,
                "schema": item.schema,
                "execution": item.execution,
                "source": item.source,
            }
            existing.permissions = item.permissions
            existing.requires_approval = item.requires_approval
            synced.append(existing)
        else:
            skill = Skill(
                name=item.name,
                version=item.version,
                description=item.description,
                manifest={
                    "permissions": item.permissions,
                    "requires_approval": item.requires_approval,
                    "risk": item.risk,
                    "schema": item.schema,
                    "execution": item.execution,
                    "source": item.source,
                },
                permissions=item.permissions,
                requires_approval=item.requires_approval,
                enabled=item.enabled,
            )
            db.add(skill)
            synced.append(skill)
    await db.commit()
    return synced
