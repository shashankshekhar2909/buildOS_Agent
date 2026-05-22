from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.db import get_db
from app.models import AuditLog, User

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("")
async def list_audit(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin", "operator"))],
    limit: int = 200,
) -> list[dict]:
    rows = (await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": str(r.id),
            "actor_id": str(r.actor_id) if r.actor_id else None,
            "actor_kind": r.actor_kind,
            "action": r.action,
            "target_kind": r.target_kind,
            "target_id": r.target_id,
            "metadata": r.metadata_json,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
