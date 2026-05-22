from skill_sdk import Skill, SkillManifest


async def handle(payload: dict) -> dict:
    return {"ok": False, "error": "stub"}


skill = Skill(
    manifest=SkillManifest(
        name="filesystem",
        description="Read/write files on a node.",
        permissions=["fs:read", "fs:write"],
        requires_approval=True,
        risk="high",
        execution="node",
    ),
    handler=handle,
)
