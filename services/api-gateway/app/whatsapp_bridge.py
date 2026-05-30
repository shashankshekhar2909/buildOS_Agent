from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import StepTrace, drive_loop, resolve_skills
from app.chat_store import record_chat_message
from app.config import get_settings
from app.db import SessionLocal
from app.llm_store import default_agent_model
from app.models import AgentRun, AgentRunState, Approval, Secret, Task, TaskState, WhatsAppMessage
from app.crypto import decrypt


def _extract_text_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            metadata = value.get("metadata") or {}
            phone_number_id = str(metadata.get("phone_number_id") or "").strip()
            for message in value.get("messages") or []:
                text = ((message.get("text") or {}).get("body") or "").strip()
                sender = str(message.get("from") or "").strip()
                if not text or not sender:
                    continue
                out.append(
                    {
                        "phone_number_id": phone_number_id,
                        "from": sender,
                        "text": text,
                        "message_id": message.get("id"),
                        "timestamp": message.get("timestamp"),
                    }
                )
    return out


async def _find_whatsapp_secret(db: AsyncSession, phone_number_id: str) -> tuple[UUID | None, dict[str, Any] | None]:
    rows = (await db.execute(select(Secret).where(Secret.name == "whatsapp"))).scalars().all()
    for row in rows:
        try:
            data = json.loads(decrypt(row.ciphertext))
        except Exception:
            continue
        if str(data.get("phone_number_id") or "").strip() == phone_number_id:
            return row.owner_id, data
    return None, None


def _send_whatsapp_sync(access_token: str, version: str, phone_number_id: str, recipient: str, message: str) -> dict[str, Any]:
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    payload = json.dumps(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {"body": message},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {access_token}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read().decode("utf-8")
    return json.loads(raw) if raw else {}


async def record_whatsapp_message(
    db: AsyncSession,
    *,
    owner_id: UUID,
    phone_number_id: str,
    remote_id: str,
    direction: str,
    text: str,
    message_id: str | None = None,
    task_id: UUID | None = None,
    agent_run_id: UUID | None = None,
) -> WhatsAppMessage:
    row = WhatsAppMessage(
        owner_id=owner_id,
        phone_number_id=phone_number_id,
        remote_id=remote_id,
        direction=direction,
        text=text,
        message_id=message_id,
        task_id=task_id,
        agent_run_id=agent_run_id,
    )
    db.add(row)
    await db.flush()
    return row


async def record_whatsapp_chat(
    db: AsyncSession,
    *,
    owner_id: UUID,
    role: str,
    content: str,
    agent_name: str,
    model: str,
    run_id: UUID | None = None,
) -> None:
    await record_chat_message(
        db,
        owner_id=owner_id,
        role=role,
        content=content,
        agent_name=agent_name,
        model=model,
        source="whatsapp",
        run_id=run_id,
    )


async def send_whatsapp_message(access_token: str, version: str, phone_number_id: str, recipient: str, message: str) -> dict[str, Any]:
    def _run() -> dict[str, Any]:
        try:
            return {
                "ok": True,
                "raw": _send_whatsapp_sync(access_token, version, phone_number_id, recipient, message),
            }
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            return {"ok": False, "error": f"whatsapp api error {exc.code}", "details": detail}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    return await asyncio.to_thread(_run)


def _short_reply(text: str, limit: int = 3000) -> str:
    value = text.strip()
    if len(value) <= limit:
        return value
    return value[: limit - 24].rstrip() + "\n\n[truncated]"


def _task_reply_payload(task: Task) -> dict[str, str] | None:
    payload = task.payload or {}
    recipient = str(payload.get("whatsapp_reply_to") or "").strip()
    access_token = str(payload.get("whatsapp_access_token") or "").strip()
    phone_number_id = str(payload.get("whatsapp_phone_number_id") or "").strip()
    version = str(payload.get("whatsapp_version") or "v20.0").strip()
    if not recipient or not access_token or not phone_number_id:
        return None
    return {
        "recipient": recipient,
        "access_token": access_token,
        "phone_number_id": phone_number_id,
        "version": version,
    }


async def _run_agent_task(db: AsyncSession, task: Task, user_id: UUID | None) -> None:
    payload = task.payload or {}
    message = str(payload.get("message") or payload.get("prompt") or "").strip()
    if not message:
        task.state = TaskState.failed
        task.error = "agent requires message"
        task.finished_at = datetime.now(tz=timezone.utc)
        return

    agent_name = str(payload.get("agent_name") or payload.get("agent") or "core").strip() or "core"
    model = str(payload.get("model") or default_agent_model()).strip() or default_agent_model()
    skill_overrides = payload.get("skill_overrides")
    if not isinstance(skill_overrides, list):
      skill_overrides = None
    system_prompt = payload.get("system_prompt")
    skill_names = payload.get("skill_names")
    if not isinstance(skill_names, list):
        skill_names = None
    max_steps = max(1, min(int(payload.get("max_steps") or 6), 12))

    prompt, allowed = resolve_skills(
        agent_name,
        skill_overrides=skill_overrides,
        system_prompt=str(system_prompt) if system_prompt is not None else None,
        skill_names=skill_names,
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": message},
    ]
    trace: list[StepTrace] = []

    run = AgentRun(
        agent_name=agent_name,
        user_id=user_id,
        model=model,
        initial_message=message,
        state=AgentRunState.running,
        messages=messages,
        steps=[],
        skills=allowed,
        max_steps=max_steps,
    )
    db.add(run)
    await db.flush()
    task.agent_run_id = run.id
    task.state = TaskState.running
    task.started_at = datetime.now(tz=timezone.utc)
    await db.flush()

    try:
        result = await drive_loop(messages, allowed, model=model, max_steps=max_steps, trace=trace)
    except Exception as exc:
        run.state = AgentRunState.failed
        run.stop_reason = "exception"
        run.error = str(exc)[:2000]
        run.messages = messages
        run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
        task.state = TaskState.failed
        task.error = str(exc)[:2000]
        task.result = {"agent": agent_name, "error": str(exc)}
        task.finished_at = datetime.now(tz=timezone.utc)
        return

    run.messages = messages
    run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
    run.stop_reason = result.stop_reason
    run.output = result.output or None
    run.pending_tool = result.pending_tool

    task.result = {"agent": agent_name, **result.to_dict()}
    if result.stop_reason == "completed":
        run.state = AgentRunState.completed
        task.state = TaskState.completed
        task.error = None
        task.finished_at = datetime.now(tz=timezone.utc)
    elif result.stop_reason == "approval_required":
        run.state = AgentRunState.waiting_approval
        task.state = TaskState.waiting_approval
        task.error = "approval required"
        if result.pending_tool:
            pt = result.pending_tool
            db.add(
                Approval(
                    agent_run_id=run.id,
                    tool_call_id=pt.get("tool_call_id"),
                    tool=pt.get("tool"),
                    action=f"agent.tool:{pt.get('skill')}",
                    risk="high",
                    payload={"agent_run_id": str(run.id), "skill": pt.get("skill"), "arguments": pt.get("arguments")},
                )
            )
    else:
        run.state = AgentRunState.failed
        task.state = TaskState.failed
        task.error = result.stop_reason or "failed"
        task.finished_at = datetime.now(tz=timezone.utc)


async def process_whatsapp_webhook(payload: dict[str, Any]) -> list[dict[str, Any]]:
    events = _extract_text_messages(payload)
    results: list[dict[str, Any]] = []
    if not events:
        return results

    async with SessionLocal() as db:
        for event in events:
            phone_number_id = event["phone_number_id"]
            from_id = event["from"]
            text = event["text"]
            owner_id, secret = await _find_whatsapp_secret(db, phone_number_id)
            if not secret:
                results.append({"ok": False, "error": "no whatsapp connector matched"})
                continue

            await record_whatsapp_message(
                db,
                owner_id=owner_id,
                phone_number_id=phone_number_id,
                remote_id=from_id,
                direction="incoming",
                text=text,
                message_id=event.get("message_id"),
            )
            await record_whatsapp_chat(
                db,
                owner_id=owner_id,
                role="user",
                content=text,
                agent_name=str(secret.get("default_agent") or "core"),
                model=str(secret.get("default_model") or default_agent_model()),
            )

            task = Task(
                title=f"WhatsApp: {text[:48]}",
                kind="agent",
                payload={
                    "agent_name": secret.get("default_agent") or "core",
                    "model": secret.get("default_model") or default_agent_model(),
                    "skill_overrides": secret.get("skill_overrides"),
                    "max_steps": int(secret.get("max_steps") or 6),
                    "message": text,
                    "whatsapp_reply_to": from_id,
                    "whatsapp_access_token": secret.get("access_token"),
                    "whatsapp_phone_number_id": secret.get("phone_number_id"),
                    "whatsapp_version": secret.get("version") or "v20.0",
                },
                created_by=owner_id,
                state=TaskState.queued,
            )
            db.add(task)
            await db.flush()
            await _run_agent_task(db, task, owner_id)
            await db.commit()

            reply = None
            if task.state == TaskState.completed:
                reply = _short_reply(str(task.result.get("output") or "Done."))
            elif task.state == TaskState.waiting_approval:
                pending = (task.result or {}).get("pending_tool") or {}
                reply = f"Need approval for {pending.get('skill') or pending.get('tool')}. Open BuildAgent approvals."
            elif task.state == TaskState.failed:
                reply = f"Failed: {task.error or 'unknown error'}"

            if reply:
                await send_whatsapp_message(
                    str(secret.get("access_token") or ""),
                    str(secret.get("version") or "v20.0"),
                    str(secret.get("phone_number_id") or ""),
                    from_id,
                    reply,
                )
                await record_whatsapp_message(
                    db,
                    owner_id=owner_id,
                    phone_number_id=phone_number_id,
                    remote_id=from_id,
                    direction="outgoing",
                    text=reply,
                    task_id=task.id,
                )
                await record_whatsapp_chat(
                    db,
                    owner_id=owner_id,
                    role="assistant",
                    content=reply,
                    agent_name=str(secret.get("default_agent") or "core"),
                    model=str(secret.get("default_model") or default_agent_model()),
                    run_id=task.agent_run_id,
                )

            results.append({"ok": True, "task_id": str(task.id), "state": task.state.value})
    return results
