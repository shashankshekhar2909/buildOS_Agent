from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import StepTrace, resume_with_tool_result
from app.skill_runtime import run_skill
from app.auth.deps import require_role
from app.db import get_db
from app.dispatcher import dispatch
from app.events import publish
from app.models import AgentRun, AgentRunState, Approval, ApprovalState, AuditLog, Task, TaskState, User
from app.schemas import ApprovalDecision, ApprovalOut
from app.task_schedule import should_delay

router = APIRouter(prefix="/v1/approvals", tags=["approvals"])


@router.get("", response_model=list[ApprovalOut])
async def list_approvals(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> list[ApprovalOut]:
    rows = (
        await db.execute(
            select(Approval).where(Approval.state == ApprovalState.pending).order_by(Approval.created_at.desc())
        )
    ).scalars().all()
    return [ApprovalOut.model_validate(a) for a in rows]


@router.post("/{approval_id}/decide", response_model=ApprovalOut)
async def decide(
    approval_id: str,
    body: ApprovalDecision,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> ApprovalOut:
    appr = (await db.execute(select(Approval).where(Approval.id == approval_id))).scalar_one_or_none()
    if not appr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "approval not found")
    if appr.state != ApprovalState.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "approval already decided")

    appr.state = ApprovalState.approved if body.approve else ApprovalState.denied
    appr.decided_by = user.id
    appr.decided_at = datetime.now(tz=timezone.utc)

    if appr.task_id:
        task = (await db.execute(select(Task).where(Task.id == appr.task_id))).scalar_one_or_none()
        if task:
            task.state = TaskState.pending if body.approve and should_delay(task.scheduled_at) else (TaskState.queued if body.approve else TaskState.cancelled)

    db.add(AuditLog(
        actor_id=user.id,
        action=f"approval.{'approve' if body.approve else 'deny'}",
        target_kind="approval",
        target_id=approval_id,
        metadata_json={"note": body.note},
    ))
    await db.commit()
    await publish("approval.decided", {
        "id": approval_id,
        "approve": body.approve,
        "task_id": str(appr.task_id) if appr.task_id else None,
        "agent_run_id": str(appr.agent_run_id) if appr.agent_run_id else None,
    })
    if body.approve and appr.task_id:
        task = (await db.execute(select(Task).where(Task.id == appr.task_id))).scalar_one_or_none()
        if task and task.state == TaskState.queued:
            await dispatch(db, task)

    if appr.agent_run_id:
        await _resume_agent_run(db, appr, approved=body.approve)

    return ApprovalOut.model_validate(appr)


async def _resume_agent_run(db: AsyncSession, appr: Approval, approved: bool) -> None:
    run = (await db.execute(select(AgentRun).where(AgentRun.id == appr.agent_run_id))).scalar_one_or_none()
    if not run or run.state != AgentRunState.waiting_approval:
        return
    pending = run.pending_tool or {}
    tool_call_id = appr.tool_call_id or pending.get("tool_call_id")
    tool_name = appr.tool or pending.get("tool")
    skill_name = pending.get("skill")
    args = pending.get("arguments") or {}
    if not tool_call_id or not tool_name or not skill_name:
        run.state = AgentRunState.failed
        run.error = "missing pending_tool metadata on resume"
        return

    if approved:
        try:
            result = await run_skill(skill_name, args)
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
    else:
        result = {"ok": False, "error": "approval denied"}

    trace = [StepTrace(**s) for s in (run.steps or [])]
    trace.append(StepTrace(tool=tool_name, arguments=args, result=result, error=None if result.get("ok") else result.get("error")))
    messages = list(run.messages or [])
    run.state = AgentRunState.running
    try:
        cont = await resume_with_tool_result(
            messages,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            result=result,
            allowed_skills=list(run.skills or []),
            model=run.model,
            max_steps=run.max_steps,
            trace=trace,
        )
    except Exception as exc:
        run.state = AgentRunState.failed
        run.error = str(exc)[:2000]
        run.messages = messages
        run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
        return

    run.messages = messages
    run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
    run.stop_reason = cont.stop_reason
    run.output = cont.output or None
    run.pending_tool = cont.pending_tool
    if cont.stop_reason == "completed":
        run.state = AgentRunState.completed
    elif cont.stop_reason == "approval_required":
        run.state = AgentRunState.waiting_approval
        if cont.pending_tool:
            db.add(Approval(
                agent_run_id=run.id,
                tool_call_id=cont.pending_tool.get("tool_call_id"),
                tool=cont.pending_tool.get("tool"),
                action=f"agent.tool:{cont.pending_tool.get('skill')}",
                risk="high",
                payload={"agent_run_id": str(run.id), "skill": cont.pending_tool.get("skill"), "arguments": cont.pending_tool.get("arguments")},
            ))
    else:
        run.state = AgentRunState.failed
