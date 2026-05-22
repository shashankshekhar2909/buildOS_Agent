from skill_sdk import Skill, SkillManifest

async def handle(payload: dict) -> dict:
    return {"ok": False, "error": "stub"}

skill = Skill(
    manifest=SkillManifest(
        name="gmail",
        description="gmail skill (stub).",
        requires_approval=True,
        risk="high",
        execution="local",
    ),
    handler=handle,
)
