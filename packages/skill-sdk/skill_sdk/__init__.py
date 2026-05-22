from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

Risk = Literal["low", "medium", "high", "critical"]


@dataclass
class SkillManifest:
    name: str
    version: str = "0.1.0"
    description: str = ""
    permissions: list[str] = field(default_factory=list)
    requires_approval: bool = True
    risk: Risk = "medium"
    schema: dict = field(default_factory=dict)
    execution: Literal["local", "remote", "node"] = "local"


@dataclass
class Skill:
    manifest: SkillManifest
    handler: Callable[[dict], Awaitable[Any]]

    async def run(self, payload: dict) -> Any:
        return await self.handler(payload)
