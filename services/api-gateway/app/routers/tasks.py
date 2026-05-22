from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.db import get_db
from app.dispatcher import dispatch
from app.events import publish
from app.models import Approval, ApprovalState, AuditLog, Task, TaskState, User
from app.schemas import TaskIn, TaskOut

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])

# Kinds that always require human approval before running.
APPROVAL_REQUIRED_KINDS = {"command", "deploy", "delete", "restart", "send_email"}


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[TaskOut]:
    rows = (await db.execute(select(Task).order_by(Task.created_at.desc()).limit(200))).scalars().all()
    return [TaskOut.model_validate(t) for t in rows]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> TaskOut:
    needs_approval = body.kind in APPROVAL_REQUIRED_KINDS
    task = Task(
        title=body.title,
        kind=body.kind,
        payload=body.payload,
        node_id=body.node_id,
        scheduled_at=body.scheduled_at,
        created_by=user.id,
        state=TaskState.waiting_approval if needs_approval else TaskState.queued,
    )
    db.add(task)
    await db.flush()
    if needs_approval:
        db.add(Approval(task_id=task.id, action=body.kind, risk="high", payload=body.payload))
    db.add(AuditLog(actor_id=user.id, action=f"task.create:{body.kind}", target_kind="task", target_id=str(task.id)))
    await db.commit()
    await db.refresh(task)
    await publish("task.created", {"id": str(task.id), "kind": task.kind, "state": task.state.value})
    if task.state == TaskState.queued:
        await dispatch(db, task)
    return TaskOut.model_validate(task)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> TaskOut:
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    return TaskOut.model_validate(t)


@router.post("/{task_id}/cancel", response_model=TaskOut)
async def cancel_task(
    task_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> TaskOut:
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    if t.state in (TaskState.completed, TaskState.failed, TaskState.cancelled):
        raise HTTPException(status.HTTP_409_CONFLICT, "task already terminal")
    t.state = TaskState.cancelled
    db.add(AuditLog(actor_id=user.id, action="task.cancel", target_kind="task", target_id=task_id))
    await db.commit()
    await publish("task.cancelled", {"id": task_id})
    return TaskOut.model_validate(t)
