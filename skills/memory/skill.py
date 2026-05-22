"""Semantic memory skill. Stores text + embedding, retrieves by similarity.

Talks back to api-gateway over INTERNAL_SERVICE_TOKEN to keep state in one
place (the postgres + pgvector that the api owns). Skill runs in the same
process as api-gateway today, so this is an in-process call rather than HTTP.
"""
from __future__ import annotations

from skill_sdk import Skill, SkillManifest


async def handle(payload: dict) -> dict:
    # Imported lazily because the skill registry loads via runpy and we want
    # to avoid pulling DB session machinery during module discovery.
    from sqlalchemy import desc, select

    from app.db import SessionLocal
    from app.embeddings import embed_one
    from app.models import Memory

    op = payload.get("op")

    if op == "store":
        text = str(payload.get("text", "")).strip()
        if not text:
            return {"ok": False, "error": "text required"}
        try:
            vec = await embed_one(text)
        except Exception as exc:
            return {"ok": False, "error": f"embedding failed: {exc}"}
        async with SessionLocal() as db:
            mem = Memory(
                user_id=None,  # agent-originated; not user-scoped
                kind=str(payload.get("kind", "fact")),
                text=text,
                embedding=vec or None,
                source="agent",
                source_id=payload.get("source_id"),
                meta=payload.get("meta") or {},
            )
            db.add(mem)
            await db.commit()
            await db.refresh(mem)
            return {"ok": True, "id": str(mem.id), "kind": mem.kind, "stored_chars": len(text)}

    if op == "recall":
        query = str(payload.get("query", "")).strip()
        if not query:
            return {"ok": False, "error": "query required"}
        limit = int(payload.get("limit", 5))
        limit = max(1, min(limit, 25))
        try:
            qvec = await embed_one(query)
        except Exception as exc:
            return {"ok": False, "error": f"embedding failed: {exc}"}
        async with SessionLocal() as db:
            distance = Memory.embedding.cosine_distance(qvec).label("distance")
            stmt = (
                select(Memory, distance)
                .where(Memory.embedding.is_not(None))
                .order_by(distance)
                .limit(limit)
            )
            if payload.get("kind"):
                stmt = stmt.where(Memory.kind == payload["kind"])
            rows = (await db.execute(stmt)).all()
            return {
                "ok": True,
                "results": [
                    {
                        "id": str(row[0].id),
                        "kind": row[0].kind,
                        "text": row[0].text,
                        "score": 1.0 - float(row[1]),
                        "created_at": row[0].created_at.isoformat() if row[0].created_at else None,
                    }
                    for row in rows
                ],
            }

    if op == "list":
        async with SessionLocal() as db:
            stmt = select(Memory).order_by(desc(Memory.created_at)).limit(int(payload.get("limit", 20)))
            if payload.get("kind"):
                stmt = stmt.where(Memory.kind == payload["kind"])
            rows = (await db.execute(stmt)).scalars().all()
            return {
                "ok": True,
                "results": [{"id": str(r.id), "kind": r.kind, "text": r.text} for r in rows],
            }

    return {"ok": False, "error": f"unknown op {op}"}


skill = Skill(
    manifest=SkillManifest(
        name="memory",
        version="1.0.0",
        description="Long-term semantic memory. Store facts/observations and recall them later by similarity.",
        permissions=["memory:read", "memory:write"],
        requires_approval=False,
        risk="low",
        execution="local",
        schema={
            "type": "object",
            "properties": {
                "op": {"type": "string", "enum": ["store", "recall", "list"]},
                "text": {"type": "string", "description": "For op=store: the fact/observation to remember."},
                "query": {"type": "string", "description": "For op=recall: what to search for semantically."},
                "kind": {"type": "string", "description": "Filter/tag: note|fact|observation|conversation."},
                "limit": {"type": "integer"},
                "source_id": {"type": "string"},
                "meta": {"type": "object"},
            },
            "required": ["op"],
        },
    ),
    handler=handle,
)
