from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from agent_runtime.llm import llm_client


@dataclass
class Tool:
    name: str
    description: str
    schema: dict
    handler: Callable[[dict], Awaitable[Any]]
    requires_approval: bool = False


class ApprovalRequired(Exception):
    def __init__(self, tool: str, arguments: dict) -> None:
        super().__init__(f"approval required for tool: {tool}")
        self.tool = tool
        self.arguments = arguments


@dataclass
class StepTrace:
    tool: str
    arguments: dict
    result: Any
    error: str | None = None


@dataclass
class RunResult:
    output: str
    steps: list[StepTrace] = field(default_factory=list)
    stop_reason: str = "completed"


def _tools_to_openai(tools: list[Tool]) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.schema or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


@dataclass
class Agent:
    name: str
    system_prompt: str
    model: str = "claude-sonnet"
    tools: list[Tool] = field(default_factory=list)
    max_steps: int = 6
    approval_callback: Callable[[str, dict], Awaitable[bool]] | None = None

    def _tool_map(self) -> dict[str, Tool]:
        return {t.name: t for t in self.tools}

    async def _invoke_tool(self, tool: Tool, args: dict, trace: list[StepTrace]) -> Any:
        if tool.requires_approval:
            if self.approval_callback is None:
                trace.append(StepTrace(tool=tool.name, arguments=args, result=None, error="approval required, no callback"))
                raise ApprovalRequired(tool.name, args)
            approved = await self.approval_callback(tool.name, args)
            if not approved:
                trace.append(StepTrace(tool=tool.name, arguments=args, result=None, error="approval denied"))
                return {"ok": False, "error": "approval denied"}
        try:
            result = await tool.handler(args)
        except Exception as exc:
            trace.append(StepTrace(tool=tool.name, arguments=args, result=None, error=str(exc)))
            return {"ok": False, "error": str(exc)}
        trace.append(StepTrace(tool=tool.name, arguments=args, result=result))
        return result

    async def run(self, user_msg: str, history: list[dict] | None = None) -> RunResult:
        client = llm_client()
        tool_map = self._tool_map()
        openai_tools = _tools_to_openai(self.tools) if self.tools else None

        messages: list[dict] = [{"role": "system", "content": self.system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_msg})

        trace: list[StepTrace] = []
        for _ in range(self.max_steps):
            kwargs: dict[str, Any] = {"model": self.model, "messages": messages}
            if openai_tools:
                kwargs["tools"] = openai_tools
                kwargs["tool_choice"] = "auto"
            resp = await client.chat.completions.create(**kwargs)
            msg = resp.choices[0].message
            tool_calls = getattr(msg, "tool_calls", None) or []
            if not tool_calls:
                return RunResult(output=msg.content or "", steps=trace, stop_reason="completed")

            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            })

            for tc in tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                tool = tool_map.get(name)
                if tool is None:
                    result: Any = {"ok": False, "error": f"unknown tool {name}"}
                    trace.append(StepTrace(tool=name, arguments=args, result=None, error="unknown tool"))
                else:
                    try:
                        result = await self._invoke_tool(tool, args, trace)
                    except ApprovalRequired as ar:
                        return RunResult(
                            output=msg.content or "",
                            steps=trace,
                            stop_reason=f"approval_required:{ar.tool}",
                        )
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": name,
                    "content": json.dumps(result, default=str),
                })

        return RunResult(output="", steps=trace, stop_reason="max_steps")
