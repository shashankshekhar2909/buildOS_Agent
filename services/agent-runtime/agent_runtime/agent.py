from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from agent_runtime.llm import llm_client


@dataclass
class Tool:
    name: str
    description: str
    schema: dict
    handler: Callable[[dict], Awaitable[Any]]
    requires_approval: bool = False


@dataclass
class Agent:
    name: str
    system_prompt: str
    model: str = "claude-sonnet"
    tools: list[Tool] = field(default_factory=list)

    async def run(self, user_msg: str, history: list[dict] | None = None) -> str:
        client = llm_client()
        messages = [{"role": "system", "content": self.system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_msg})
        resp = await client.chat.completions.create(model=self.model, messages=messages)
        return resp.choices[0].message.content or ""
