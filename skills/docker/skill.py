from __future__ import annotations

import json
import subprocess

from skill_sdk import Skill, SkillManifest


def _run(*args: str) -> dict:
    try:
        proc = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=20)
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def handle(payload: dict) -> dict:
    op = payload.get("op")
    name = payload.get("name")

    if op == "ps":
        result = _run("ps", "--format", "{{json .}}")
        if not result.get("ok"):
            return result
        lines = [line for line in result.get("stdout", "").splitlines() if line.strip()]
        result["containers"] = [json.loads(line) for line in lines]
        return result

    if not name:
        return {"ok": False, "error": "name required"}

    if op == "start":
        return _run("start", name)
    if op == "stop":
        return _run("stop", name)
    if op == "restart":
        return _run("restart", name)
    if op == "logs":
        return _run("logs", "--tail", "200", name)

    return {"ok": False, "error": f"unknown op {op}"}


skill = Skill(
    manifest=SkillManifest(
        name="docker",
        version="1.0.0",
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
