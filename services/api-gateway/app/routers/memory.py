from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user
from app.db import get_db
from app.embeddings import embed_one, embedding_model
from app.models import AuditLog, Memory, User

router = APIRouter(prefix="/v1/memory", tags=["memory"])


class MemoryIn(BaseModel):
    text: str = Field(min_length=1, max_length=8192)
    kind: str = "note"
    source: str = "manual"
    source_id: str | None = None
    meta: dict = Field(default_factory=dict)


class MemoryOut(BaseModel):
    id: str
    user_id: str | None
    kind: str
    text: str
    source: str
    source_id: str | None
    meta: dict
    created_at: str
    score: float | None = None

    @classmethod
    def from_row(cls, row: Memory, score: float | None = None) -> "MemoryOut":
        return cls(
            id=str(row.id),
            user_id=str(row.user_id) if row.user_id else None,
            kind=row.kind,
            text=row.text,
            source=row.source,
            source_id=row.source_id,
            meta=row.meta or {},
            created_at=row.created_at.isoformat() if row.created_at else "",
            score=score,
        )


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=4096)
    limit: int = Field(default=10, ge=1, le=50)
    kind: str | None = None


@router.get("", response_model=list[MemoryOut])
async def list_memories(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
    kind: str | None = None,
    limit: int = 50,
) -> list[MemoryOut]:
    stmt = select(Memory).where(Memory.user_id == user.id).order_by(desc(Memory.created_at)).limit(min(limit, 200))
    if kind:
        stmt = stmt.where(Memory.kind == kind)
    rows = (await db.execute(stmt)).scalars().all()
    return [MemoryOut.from_row(r) for r in rows]


@router.post("", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
async def create_memory(
    body: MemoryIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> MemoryOut:
    try:
        vec = await embed_one(body.text)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"embedding failed: {exc}")
    mem = Memory(
        user_id=user.id,
        kind=body.kind,
        text=body.text,
        embedding=vec or None,
        source=body.source,
        source_id=body.source_id,
        meta=body.meta,
    )
    db.add(mem)
    db.add(AuditLog(actor_id=user.id, action="memory.create", target_kind="memory", target_id=str(mem.id), metadata_json={"kind": body.kind}))
    await db.commit()
    await db.refresh(mem)
    return MemoryOut.from_row(mem)


@router.post("/search", response_model=list[MemoryOut])
async def search(
    body: SearchIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> list[MemoryOut]:
    try:
        qvec = await embed_one(body.query)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"embedding failed: {exc}")
    distance = Memory.embedding.cosine_distance(qvec).label("distance")
    stmt = (
        select(Memory, distance)
        .where(Memory.user_id == user.id)
        .where(Memory.embedding.is_not(None))
        .order_by(distance)
        .limit(body.limit)
    )
    if body.kind:
        stmt = stmt.where(Memory.kind == body.kind)
    rows = (await db.execute(stmt)).all()
    return [MemoryOut.from_row(r[0], score=1.0 - float(r[1])) for r in rows]


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> None:
    try:
        uid = UUID(memory_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid memory id")
    mem = (await db.execute(select(Memory).where(Memory.id == uid, Memory.user_id == user.id))).scalar_one_or_none()
    if not mem:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "memory not found")
    await db.delete(mem)
    db.add(AuditLog(actor_id=user.id, action="memory.delete", target_kind="memory", target_id=memory_id))
    await db.commit()


@router.get("/_meta/model")
async def meta_model(_user: Annotated[User, Depends(current_user)]) -> dict:
    return {"model": embedding_model(), "dim": 1536}
