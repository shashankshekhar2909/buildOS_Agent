import secrets
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.auth.jwt import hash_password
from app.db import get_db
from app.events import publish
from app.models import AuditLog, Node, User
from app.schemas import NodeIn, NodeOut, NodeRegisterOut, NodeUpdateIn

router = APIRouter(prefix="/v1/nodes", tags=["nodes"])


@router.get("", response_model=list[NodeOut])
async def list_nodes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[NodeOut]:
    rows = (await db.execute(select(Node).order_by(Node.created_at.desc()))).scalars().all()
    return [NodeOut.model_validate(n) for n in rows]


@router.post("", response_model=NodeRegisterOut, status_code=status.HTTP_201_CREATED)
async def create_node(
    body: NodeIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> NodeRegisterOut:
    token = secrets.token_urlsafe(32)
    node = Node(name=body.name, tags=body.tags, status=body.status, capabilities=body.capabilities, token_hash=hash_password(token))
    db.add(node)
    db.add(AuditLog(actor_id=user.id, action="node.create", target_kind="node", target_id=body.name))
    await db.commit()
    await db.refresh(node)
    await publish("node.created", {"id": str(node.id), "name": node.name})
    return NodeRegisterOut(node=NodeOut.model_validate(node), register_token=token)


@router.patch("/{node_id}", response_model=NodeOut)
async def update_node(
    node_id: str,
    body: NodeUpdateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> NodeOut:
    node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    if body.name is not None:
        node.name = body.name
    if body.tags is not None:
        node.tags = body.tags
    if body.status is not None:
        node.status = body.status
    if body.capabilities is not None:
        node.capabilities = body.capabilities
    db.add(AuditLog(actor_id=user.id, action="node.update", target_kind="node", target_id=node_id))
    await db.commit()
    await db.refresh(node)
    await publish("node.updated", {"id": node_id, "name": node.name})
    return NodeOut.model_validate(node)


@router.get("/{node_id}", response_model=NodeOut)
async def get_node(
    node_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> NodeOut:
    node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    return NodeOut.model_validate(node)


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    await db.delete(node)
    db.add(AuditLog(actor_id=user.id, action="node.delete", target_kind="node", target_id=node_id))
    await db.commit()
    await publish("node.deleted", {"id": node_id})
