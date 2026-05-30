"""In-process agent tool-calling loop.

Uses LiteLLM gateway via the OpenAI-compatible client. Tools are sourced from
the on-disk skill registry (skill_runtime) and wrapped as OpenAI function tools.
Approval-gated tools pause the loop and return stop_reason="approval_required".
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from google import genai
from google.genai import types
from openai import AsyncOpenAI

from app.config import get_settings
from app.llm_store import gemini_api_key, gemini_model, litellm_master_key
from app.skill_runtime import _registry as skill_registry  # noqa: F401  - reuse cache


@dataclass
class StepTrace:
    tool: str
    arguments: dict
    result: Any
    error: str | None = None

    def model_dump(self) -> dict:
        return {
            "tool": self.tool,
            "arguments": self.arguments,
            "result": self.result,
            "error": self.error,
        }


@dataclass
class RunResult:
    output: str
    steps: list[StepTrace] = field(default_factory=list)
    stop_reason: str = "completed"
    pending_tool: dict | None = None  # populated when stop_reason == "approval_required"

    def to_dict(self) -> dict:
        return {
            "output": self.output,
            "stop_reason": self.stop_reason,
            "pending_tool": self.pending_tool,
            "steps": [
                {"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error}
                for s in self.steps
            ],
        }


def _llm_client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(base_url=settings.litellm_url, api_key=litellm_master_key())


def _gemini_client() -> genai.Client:
    key = gemini_api_key()
    if not key:
        raise RuntimeError("Gemini not configured (set GEMINI_API_KEY).")
    return genai.Client(api_key=key)


def _schema_is_object(schema: dict) -> bool:
    schema_type = str(schema.get("type") or "").lower()
    return schema_type == "object" or "properties" in schema


def _normalize_skill_schema(raw_schema: Any) -> dict:
    """Return an OpenAI/Gemini-friendly JSON schema object.

    Skill manifests may define either a full JSON schema object or a flat
    field map. Gemini rejects the flat map, so we always normalize to:
    {type: object, properties: {...}, required: [...]}
    """
    schema = raw_schema if isinstance(raw_schema, dict) else {}
    if not schema:
        return {"type": "object", "properties": {}}

    schema_keywords = {
        "type",
        "properties",
        "items",
        "required",
        "enum",
        "description",
        "title",
        "default",
        "format",
        "nullable",
        "additionalProperties",
        "anyOf",
        "allOf",
        "oneOf",
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "$ref",
        "ref",
    }

    looks_like_schema = any(key in schema for key in schema_keywords)
    if not looks_like_schema and not _schema_is_object(schema):
        schema = {"type": "object", "properties": schema}

    out: dict[str, Any] = {}
    schema_type = str(schema.get("type") or "object").lower()
    out["type"] = schema_type

    if "description" in schema and schema["description"] is not None:
        out["description"] = schema["description"]
    if "title" in schema and schema["title"] is not None:
        out["title"] = schema["title"]
    if "enum" in schema and schema["enum"] is not None:
        out["enum"] = list(schema["enum"])
    if "default" in schema and schema["default"] is not None:
        out["default"] = schema["default"]
    if "format" in schema and schema["format"] is not None:
        out["format"] = schema["format"]
    if "nullable" in schema and schema["nullable"] is not None:
        out["nullable"] = bool(schema["nullable"])
    if "required" in schema and schema["required"] is not None:
        out["required"] = list(schema["required"])
    if "propertyOrdering" in schema and schema["propertyOrdering"] is not None:
        out["propertyOrdering"] = list(schema["propertyOrdering"])

    properties = schema.get("properties") or {}
    if isinstance(properties, dict):
        out["properties"] = {key: _normalize_skill_schema(value) for key, value in properties.items()}
    else:
        out["properties"] = {}

    items = schema.get("items")
    if items is not None:
        out["items"] = _normalize_skill_schema(items)

    additional_properties = schema.get("additionalProperties")
    if additional_properties is not None:
        if isinstance(additional_properties, dict):
            out["additionalProperties"] = _normalize_skill_schema(additional_properties)
        else:
            out["additionalProperties"] = bool(additional_properties)

    any_of = schema.get("anyOf")
    if isinstance(any_of, list):
        out["anyOf"] = [_normalize_skill_schema(item) for item in any_of]

    ref = schema.get("$ref") or schema.get("ref")
    if ref is not None:
        out["$ref"] = ref

    schema_type_map = {
        "string": "string",
        "number": "number",
        "integer": "integer",
        "boolean": "boolean",
        "array": "array",
        "object": "object",
        "null": "null",
    }
    if schema_type in schema_type_map:
        out["type"] = schema_type_map[schema_type]

    return out


def _skill_to_tool_schema(name: str) -> dict:
    skill = skill_registry().get(name)
    if not skill:
        return {}
    schema = _normalize_skill_schema(getattr(skill.manifest, "schema", None))
    return {
        "type": "function",
        "function": {
            "name": f"skill_{name}",
            "description": getattr(skill.manifest, "description", "") or name,
            "parameters": schema,
        },
    }


def _build_tools(skill_names: list[str]) -> list[dict]:
    tools: list[dict] = []
    for name in skill_names:
        schema = _skill_to_tool_schema(name)
        if schema:
            tools.append(schema)
    return tools


def _build_gemini_tools(skill_names: list[str]) -> list[types.Tool]:
    decls: list[types.FunctionDeclaration] = []
    for name in skill_names:
        skill = skill_registry().get(name)
        if not skill:
            continue
        schema = _normalize_skill_schema(getattr(skill.manifest, "schema", None))
        decls.append(
            types.FunctionDeclaration(
                name=f"skill_{name}",
                description=getattr(skill.manifest, "description", "") or name,
                parametersJsonSchema=schema,
            )
        )
    return [types.Tool(function_declarations=decls)] if decls else []


def _is_readonly_tool_call(skill_name: str, args: dict[str, Any]) -> bool:
    op = str(args.get("op") or args.get("action") or "").strip().lower()
    if skill_name in {"gmail", "calendar"}:
        return True
    if skill_name == "filesystem":
        return True
    if skill_name == "proxmox":
        return op in {"nodes", "vms", "status", "vm_status", "tasks"}
    if skill_name == "docker":
        return op in {"ps", "logs"}
    return False


def _normalize_tool_arguments(skill_name: str, args: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(args or {})
    if skill_name == "docker":
        op = str(normalized.get("op") or "").strip().lower()
        command = str(normalized.get("command") or normalized.get("cmd") or "").strip().lower()
        name = str(normalized.get("name") or "").strip()
        action = str(normalized.get("action") or "").strip().lower()
        if not op and command:
            if command in {"info", "help", "list", "status", "show", "count"}:
                normalized = {"op": "ps"}
            elif "docker ps" in command or command.startswith("ps"):
                normalized = {"op": "ps"}
            elif "docker logs" in command and name:
                normalized = {"op": "logs", "name": name}
            elif "docker stop" in command and name:
                normalized = {"op": "stop", "name": name}
            elif "docker restart" in command and name:
                normalized = {"op": "restart", "name": name}
        if not op and (action in {"help", "list", "status", "inspect", "show", "count"} or "all" in normalized):
            normalized = {"op": "ps"}
    return normalized


def _normalize_tool_name(tool_name: str, allowed_skills: list[str]) -> str:
    name = str(tool_name or "").strip()
    if not name:
        return ""
    if name.startswith("skill_"):
        return name
    if name in allowed_skills:
        return f"skill_{name}"
    return name


def _tool_protocol_prompt(base_prompt: str, allowed_skills: list[str]) -> str:
    tool_lines = "\n".join(f"- {name} (or skill_{name})" for name in allowed_skills)
    return (
        f"{base_prompt}\n\n"
        "You can use tools. When you need one, reply with ONLY valid JSON, no markdown.\n"
        'Tool action format: {"type":"tool","tool":"docker","arguments":{...}}\n'
        'Or: {"type":"tool","tool":"skill_docker","arguments":{...}}\n'
        'Final answer format: {"type":"final","output":"..."}\n'
        "Available tools:\n"
        f"{tool_lines}\n"
        "If you need to inspect something, use a tool. If the task is done, return final."
    )


def _parse_text_action(text: str) -> dict[str, Any] | None:
    raw = text.strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.removeprefix("json").strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]
    try:
        obj = json.loads(raw)
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    kind = str(obj.get("type") or "").strip().lower()
    if kind not in {"tool", "final"}:
        if "tool" in obj:
            kind = "tool"
        elif "output" in obj:
            kind = "final"
        else:
            return None
    if kind == "tool":
        return {
            "type": "tool",
            "tool": str(obj.get("tool") or obj.get("name") or "").strip(),
            "arguments": obj.get("arguments") if isinstance(obj.get("arguments"), dict) else (obj.get("payload") if isinstance(obj.get("payload"), dict) else {}),
        }
    return {"type": "final", "output": str(obj.get("output") or obj.get("text") or "").strip()}


def _uses_gemini(model: str) -> bool:
    return model.startswith("gemini") or model.startswith("google/") or model == gemini_model()


def _messages_to_gemini_contents(messages: list[dict]) -> tuple[str | None, list[types.Content]]:
    system = None
    contents: list[types.Content] = []
    for msg in messages:
        role = msg.get("role")
        if role == "system":
            if system is None:
                system = str(msg.get("content") or "")
            continue
        if role == "user":
            contents.append(types.Content(role="user", parts=[types.Part(text=str(msg.get("content") or ""))]))
            continue
        if role == "assistant":
            parts: list[types.Part] = []
            for tc in msg.get("tool_calls") or []:
                fn = (tc.get("function") or {}).get("name") or ""
                if not fn:
                    continue
                args_raw = (tc.get("function") or {}).get("arguments") or "{}"
                try:
                    args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
                except Exception:
                    args = {}
                parts.append(types.Part.from_function_call(name=fn, args=args))
            if parts:
                contents.append(types.Content(role="model", parts=parts))
            elif msg.get("content"):
                contents.append(types.Content(role="model", parts=[types.Part(text=str(msg.get("content") or ""))]))
            continue
        if role == "tool":
            fn_name = str(msg.get("name") or "")
            content = msg.get("content")
            try:
                response = json.loads(content) if isinstance(content, str) else (content or {})
            except Exception:
                response = {"result": content}
            contents.append(types.Content(role="user", parts=[types.Part.from_function_response(name=fn_name, response=response)]))
    return system, contents


def _gemini_response_to_output(resp) -> tuple[str, types.Content | None, list[tuple[str, dict[str, Any]]]]:
    content = resp.candidates[0].content if getattr(resp, "candidates", None) else None
    parts = list(getattr(content, "parts", []) or [])
    text = getattr(resp, "text", "") or ""
    calls: list[tuple[str, dict[str, Any]]] = []
    if parts:
        texts: list[str] = []
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc:
                args = getattr(fc, "args", {}) or {}
                calls.append((fc.name, dict(args)))
                continue
            if getattr(part, "text", None):
                texts.append(str(part.text))
        if texts:
            text = "\n".join(texts)
    return text, content, calls


AGENT_PRESETS: dict[str, dict] = {
    "core": {
        "model": "gemini-flash",
        "system_prompt": (
            "You are BuildAgent Core. Orchestrate work using available skill tools. "
            "Prefer the smallest tool that solves the task. Dangerous tools require "
            "human approval — the system will pause when needed."
        ),
        "skills": None,  # None = all available
    },
    "infra": {
        "model": "gemini-flash",
        "system_prompt": "You manage docker, ssh, proxmox, filesystem. Inspect before mutating.",
        "skills": ["docker", "ssh", "proxmox", "filesystem"],
    },
    "mail": {
        "model": "gemini-flash",
        "system_prompt": "You triage inbox, draft replies, schedule events. Never send without approval.",
        "skills": ["gmail", "calendar"],
    },
    "messenger": {
        "model": "gemini-flash",
        "system_prompt": "You send messages on slack/telegram/whatsapp. Confirm recipient before sending.",
        "skills": ["slack", "telegram", "whatsapp"],
    },
    "notes": {
        "model": "gemini-flash",
        "system_prompt": "You organize knowledge, summarize, manage notes.",
        "skills": ["notes"],
    },
    "dev": {
        "model": "gemini-flash",
        "system_prompt": "You manage repos, CI/CD, code. Show diffs before applying.",
        "skills": ["filesystem", "ssh", "docker"],
    },
}


def list_agents() -> list[dict]:
    available = set(skill_registry().keys())
    out: list[dict] = []
    for name, preset in AGENT_PRESETS.items():
        skills = preset["skills"] if preset["skills"] is not None else sorted(available)
        out.append({
            "name": name,
            "system_prompt": preset["system_prompt"],
            "skills": [s for s in skills if s in available],
        })
    return out


async def _invoke_skill(name: str, args: dict) -> dict:
    from app.skill_runtime import run_skill  # local import to avoid cycle

    return await run_skill(name, args)


async def _drive_loop_gemini(
    messages: list[dict],
    allowed_skills: list[str],
    model: str,
    max_steps: int,
    trace: list[StepTrace],
    approval_resolver=None,
) -> RunResult:
    client = _gemini_client()
    tools = _build_gemini_tools(allowed_skills)
    system_prompt, contents = _messages_to_gemini_contents(messages)
    config = types.GenerateContentConfig(
        tools=tools or None,
        system_instruction=system_prompt or None,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="ANY")),
    )

    async def _generate() -> Any:
        return await asyncio.to_thread(client.models.generate_content, model=model, contents=contents, config=config)

    for _ in range(max_steps):
        resp = await _generate()
        text, model_message, calls = _gemini_response_to_output(resp)
        if not calls:
            messages.extend([{"role": "assistant", "content": text}])
            return RunResult(output=text, steps=trace, stop_reason="completed")

        messages.append({
            "role": "assistant",
            "content": text,
            "tool_calls": [
                {"id": tool_name, "type": "function", "function": {"name": tool_name, "arguments": json.dumps(args)}}
                for tool_name, args in calls
            ],
        })
        if model_message is not None:
            contents.append(model_message)

        for tool_name, args in calls:
            if not tool_name.startswith("skill_"):
                result = {"ok": False, "error": f"unknown tool {tool_name}"}
                trace.append(StepTrace(tool=tool_name, arguments=args, result=None, error="unknown tool"))
                fn_name = tool_name
                fr = types.Part.from_function_response(name=fn_name, response=result)
                contents.append(types.Content(role="user", parts=[fr]))
                messages.append({"role": "tool", "tool_call_id": fn_name, "name": fn_name, "content": json.dumps(result)})
                continue

            skill_name = tool_name[len("skill_"):]
            skill = skill_registry().get(skill_name)
            if skill is None:
                result = {"ok": False, "error": f"skill {skill_name} not loaded"}
                trace.append(StepTrace(tool=tool_name, arguments=args, result=None, error="skill missing"))
                fr = types.Part.from_function_response(name=tool_name, response=result)
                contents.append(types.Content(role="user", parts=[fr]))
                messages.append({"role": "tool", "tool_call_id": tool_name, "name": tool_name, "content": json.dumps(result)})
                continue

            requires_approval = bool(getattr(skill.manifest, "requires_approval", False))
            if requires_approval:
                if _is_readonly_tool_call(skill_name, args):
                    pass
                elif approval_resolver is None:
                    return RunResult(
                        output=text,
                        steps=trace,
                        stop_reason="approval_required",
                        pending_tool={"tool": tool_name, "skill": skill_name, "arguments": args, "tool_call_id": tool_name},
                    )
                else:
                    approved = await approval_resolver(skill_name, args)
                    if not approved:
                        result = {"ok": False, "error": "approval denied"}
                        trace.append(StepTrace(tool=tool_name, arguments=args, result=None, error="approval denied"))
                        fr = types.Part.from_function_response(name=tool_name, response=result)
                        contents.append(types.Content(role="user", parts=[fr]))
                        messages.append({"role": "tool", "tool_call_id": tool_name, "name": tool_name, "content": json.dumps(result)})
                        continue

            result = await _invoke_skill(skill_name, args)
            trace.append(StepTrace(tool=tool_name, arguments=args, result=result))
            fr = types.Part.from_function_response(name=tool_name, response=result)
            contents.append(types.Content(role="user", parts=[fr]))
            messages.append({"role": "tool", "tool_call_id": tool_name, "name": tool_name, "content": json.dumps(result, default=str)})

    return RunResult(output="", steps=trace, stop_reason="max_steps")


def resolve_skills(
    agent_name: str,
    skill_overrides: list[str] | None = None,
    system_prompt: str | None = None,
    skill_names: list[str] | None = None,
) -> tuple[str, list[str]]:
    """Return (system_prompt, allowed_skills) for an agent."""
    preset = AGENT_PRESETS.get(agent_name)
    available = list(skill_registry().keys())
    prompt = system_prompt or (preset["system_prompt"] if preset else "")
    base_skills = skill_names if skill_names is not None else (preset["skills"] if preset else None)
    allowed = skill_overrides or base_skills or available
    allowed = [s for s in allowed if s in available]
    return prompt, allowed


async def drive_loop(
    messages: list[dict],
    allowed_skills: list[str],
    model: str = "claude-sonnet",
    max_steps: int = 6,
    trace: list[StepTrace] | None = None,
    approval_resolver=None,
) -> RunResult:
    """Drive the LLM tool-loop from an existing message array. Used for both
    fresh runs and resume-after-approval. Mutates `messages` in place."""
    trace = trace if trace is not None else []
    client = _llm_client()

    if _uses_gemini(model):
        prompt_messages = list(messages)
        if prompt_messages and prompt_messages[0].get("role") == "system":
            prompt_messages[0] = {
                "role": "system",
                "content": _tool_protocol_prompt(str(prompt_messages[0].get("content") or ""), allowed_skills),
            }
        else:
            prompt_messages.insert(
                0,
                {
                    "role": "system",
                    "content": _tool_protocol_prompt("", allowed_skills),
                },
            )

        for _ in range(max_steps):
            resp = await client.chat.completions.create(model=model, messages=prompt_messages)
            msg = resp.choices[0].message
            content = msg.content or ""
            action = _parse_text_action(content)
            if not action or action.get("type") == "final":
                final_output = (action or {}).get("output") if action else content
                messages.append({"role": "assistant", "content": content})
                return RunResult(output=str(final_output or content), steps=trace, stop_reason="completed")

            tool_name = _normalize_tool_name(str(action.get("tool") or "").strip(), allowed_skills)
            args = action.get("arguments") if isinstance(action.get("arguments"), dict) else {}
            if not tool_name.startswith("skill_"):
                result = {"ok": False, "error": f"unknown tool {tool_name}"}
                trace.append(StepTrace(tool=tool_name or "unknown", arguments=args, result=None, error="unknown tool"))
                prompt_messages.append({"role": "assistant", "content": content})
                prompt_messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result)}"})
                messages.append({"role": "assistant", "content": content})
                messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result)}"})
                continue

            skill_name = tool_name[len("skill_"):]
            skill = skill_registry().get(skill_name)
            if skill is None:
                result = {"ok": False, "error": f"skill {skill_name} not loaded"}
                trace.append(StepTrace(tool=tool_name, arguments=args, result=None, error="skill missing"))
                prompt_messages.append({"role": "assistant", "content": content})
                prompt_messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result)}"})
                messages.append({"role": "assistant", "content": content})
                messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result)}"})
                continue

            args = _normalize_tool_arguments(skill_name, args)

            requires_approval = bool(getattr(skill.manifest, "requires_approval", False))
            if requires_approval and not _is_readonly_tool_call(skill_name, args):
                if approval_resolver is None:
                    return RunResult(
                        output=content,
                        steps=trace,
                        stop_reason="approval_required",
                        pending_tool={"tool": tool_name, "skill": skill_name, "arguments": args, "tool_call_id": tool_name},
                    )
                approved = await approval_resolver(skill_name, args)
                if not approved:
                    result = {"ok": False, "error": "approval denied"}
                    trace.append(StepTrace(tool=tool_name, arguments=args, result=None, error="approval denied"))
                    prompt_messages.append({"role": "assistant", "content": content})
                    prompt_messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result)}"})
                    messages.append({"role": "assistant", "content": content})
                    messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result)}"})
                    continue

            result = await _invoke_skill(skill_name, args)
            trace.append(StepTrace(tool=tool_name, arguments=args, result=result))
            prompt_messages.append({"role": "assistant", "content": content})
            prompt_messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result, default=str)}"})
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": f"TOOL_RESULT {tool_name}: {json.dumps(result, default=str)}"})

        return RunResult(output="", steps=trace, stop_reason="max_steps")

    for _ in range(max_steps):
        kwargs: dict[str, Any] = {"model": model, "messages": messages}
        tools = _build_tools(allowed_skills)
        if tools:
            kwargs["tools"] = tools
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
            tname = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            if not tname.startswith("skill_"):
                result: dict = {"ok": False, "error": f"unknown tool {tname}"}
                trace.append(StepTrace(tool=tname, arguments=args, result=None, error="unknown tool"))
                messages.append({"role": "tool", "tool_call_id": tc.id, "name": tname, "content": json.dumps(result)})
                continue

            skill_name = tname[len("skill_"):]
            skill = skill_registry().get(skill_name)
            if skill is None:
                result = {"ok": False, "error": f"skill {skill_name} not loaded"}
                trace.append(StepTrace(tool=tname, arguments=args, result=None, error="skill missing"))
                messages.append({"role": "tool", "tool_call_id": tc.id, "name": tname, "content": json.dumps(result)})
                continue

            args = _normalize_tool_arguments(skill_name, args)

            requires_approval = bool(getattr(skill.manifest, "requires_approval", False))
            if requires_approval:
                if _is_readonly_tool_call(skill_name, args):
                    pass
                elif approval_resolver is None:
                    return RunResult(
                        output=msg.content or "",
                        steps=trace,
                        stop_reason="approval_required",
                        pending_tool={"tool": tname, "skill": skill_name, "arguments": args, "tool_call_id": tc.id},
                    )
                else:
                    approved = await approval_resolver(skill_name, args)
                    if not approved:
                        result = {"ok": False, "error": "approval denied"}
                        trace.append(StepTrace(tool=tname, arguments=args, result=None, error="approval denied"))
                        messages.append({"role": "tool", "tool_call_id": tc.id, "name": tname, "content": json.dumps(result)})
                        continue

            result = await _invoke_skill(skill_name, args)
            trace.append(StepTrace(tool=tname, arguments=args, result=result))
            messages.append({"role": "tool", "tool_call_id": tc.id, "name": tname, "content": json.dumps(result, default=str)})

    return RunResult(output="", steps=trace, stop_reason="max_steps")


async def resume_with_tool_result(
    messages: list[dict],
    tool_call_id: str,
    tool_name: str,
    result: dict,
    allowed_skills: list[str],
    model: str = "claude-sonnet",
    max_steps: int = 6,
    trace: list[StepTrace] | None = None,
) -> RunResult:
    """Inject a tool-result message for a previously-paused tool call,
    then continue the loop."""
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call_id,
        "name": tool_name,
        "content": json.dumps(result, default=str),
    })
    return await drive_loop(messages, allowed_skills, model=model, max_steps=max_steps, trace=trace)


async def run_agent(
    agent_name: str,
    user_msg: str,
    model: str = "claude-sonnet",
    max_steps: int = 6,
    skill_overrides: list[str] | None = None,
    system_prompt: str | None = None,
    skill_names: list[str] | None = None,
    approval_resolver=None,
) -> RunResult:
    """Legacy entry: build messages from scratch and drive the loop."""
    preset = AGENT_PRESETS.get(agent_name)
    if not preset and not system_prompt:
        return RunResult(output="", stop_reason=f"unknown agent {agent_name}")
    prompt, allowed = resolve_skills(agent_name, skill_overrides, system_prompt, skill_names)
    messages: list[dict] = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": user_msg},
    ]
    return await drive_loop(messages, allowed, model=model, max_steps=max_steps, approval_resolver=approval_resolver)
