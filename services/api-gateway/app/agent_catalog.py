from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import AGENT_PRESETS
from app.models import Agent


async def sync_agent_catalog(db: AsyncSession) -> None:
    rows = (await db.execute(select(Agent))).scalars().all()
    existing = {row.name: row for row in rows}
    changed = False
    for name, preset in AGENT_PRESETS.items():
        row = existing.get(name)
        if row is None:
            db.add(
                Agent(
                    name=name,
                    system_prompt=preset["system_prompt"],
                    model=preset.get("model"),
                    skills=list(preset["skills"] or []),
                    enabled=True,
                    source="preset",
                )
            )
            changed = True
            continue
        row.system_prompt = preset["system_prompt"]
        row.model = preset.get("model") or row.model
        row.skills = list(preset["skills"] or [])
        row.source = "preset"
        row.enabled = True
        changed = True
    if changed:
        await db.commit()
