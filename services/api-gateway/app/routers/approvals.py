from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.db import get_db
from app.events import publish
from app.models import Approval, ApprovalState, AuditLog, Task, TaskState, User
from app.schemas import ApprovalDecision, ApprovalOut

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
            task.state = TaskState.queued if body.approve else TaskState.cancelled

    db.add(AuditLog(
        actor_id=user.id,
        action=f"approval.{'approve' if body.approve else 'deny'}",
        target_kind="approval",
        target_id=approval_id,
        metadata_json={"note": body.note},
    ))
    await db.commit()
    await publish("approval.decided", {"id": approval_id, "approve": body.approve, "task_id": str(appr.task_id) if appr.task_id else None})
    return ApprovalOut.model_validate(appr)
