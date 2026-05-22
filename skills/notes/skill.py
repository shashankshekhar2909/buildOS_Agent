from skill_sdk import Skill, SkillManifest


async def handle(payload: dict) -> dict:
    return {"ok": True, "stub": True}


skill = Skill(
    manifest=SkillManifest(
        name="notes",
        description="Create, search, and manage notes.",
        permissions=["notes:read", "notes:write"],
        requires_approval=False,
        risk="low",
        execution="local",
    ),
    handler=handle,
)
