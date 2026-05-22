from skill_sdk import Skill, SkillManifest


async def handle(payload: dict) -> dict:
    op = payload.get("op")  # ps|start|stop|restart|logs
    name = payload.get("name")
    return {"ok": False, "error": "stub", "op": op, "name": name}


skill = Skill(
    manifest=SkillManifest(
        name="docker",
        description="Manage Docker containers on a node.",
        permissions=["docker:read", "docker:write"],
        requires_approval=True,
        risk="high",
        execution="node",
        schema={
            "type": "object",
            "properties": {
                "op": {"type": "string", "enum": ["ps", "start", "stop", "restart", "logs"]},
                "name": {"type": "string"},
            },
            "required": ["op"],
        },
    ),
    handler=handle,
)
