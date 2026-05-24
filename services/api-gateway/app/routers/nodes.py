import secrets
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.auth.jwt import hash_password
from app.db import get_db
from app.events import publish
from app.node_store import has_node_ssh_config, set_node_ssh_config
from app.models import AuditLog, Node, User
from app.schemas import NodeIn, NodeOut, NodeRegisterOut, NodeUpdateIn

router = APIRouter(prefix="/v1/nodes", tags=["nodes"])


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _serialize_node(node: Node, ssh_configured: bool = False) -> NodeOut:
    return NodeOut.model_validate(node).model_copy(update={"ssh_configured": ssh_configured})


@router.get("", response_model=list[NodeOut])
async def list_nodes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[NodeOut]:
    rows = (await db.execute(select(Node).order_by(Node.created_at.desc()))).scalars().all()
    return [_serialize_node(n, await has_node_ssh_config(db, n.id)) for n in rows]


@router.post("", response_model=NodeRegisterOut, status_code=status.HTTP_201_CREATED)
async def create_node(
    body: NodeIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> NodeRegisterOut:
    token = secrets.token_urlsafe(32)
    node = Node(
        name=body.name,
        tags=body.tags,
        status=body.status,
        capabilities=body.capabilities,
        token_hash=hash_password(token),
    )
    db.add(node)
    await db.flush()
    await set_node_ssh_config(
        db,
        node,
        ssh_host=_clean_text(body.ssh_host),
        ssh_user=_clean_text(body.ssh_user),
        ssh_port=body.ssh_port,
        ssh_auth_type=_clean_text(body.ssh_auth_type),
        ssh_password=body.ssh_password,
        ssh_private_key=body.ssh_private_key,
        ssh_known_hosts=body.ssh_known_hosts,
    )
    db.add(AuditLog(actor_id=user.id, action="node.create", target_kind="node", target_id=body.name))
    await db.commit()
    await db.refresh(node)
    await publish("node.created", {"id": str(node.id), "name": node.name})
    return NodeRegisterOut(node=_serialize_node(node, await has_node_ssh_config(db, node.id)), register_token=token)


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
    if body.ssh_host is not None:
        node.ssh_host = _clean_text(body.ssh_host)
    if body.ssh_user is not None:
        node.ssh_user = _clean_text(body.ssh_user)
    if body.ssh_port is not None:
        node.ssh_port = body.ssh_port
    if body.ssh_auth_type is not None:
        node.ssh_auth_type = _clean_text(body.ssh_auth_type)
    if body.ssh_password is not None or body.ssh_private_key is not None or body.ssh_known_hosts is not None:
        await set_node_ssh_config(
            db,
            node,
            ssh_host=node.ssh_host,
            ssh_user=node.ssh_user,
            ssh_port=node.ssh_port,
            ssh_auth_type=node.ssh_auth_type,
            ssh_password=body.ssh_password,
            ssh_private_key=body.ssh_private_key,
            ssh_known_hosts=body.ssh_known_hosts,
        )
    db.add(AuditLog(actor_id=user.id, action="node.update", target_kind="node", target_id=node_id))
    await db.commit()
    await db.refresh(node)
    await publish("node.updated", {"id": node_id, "name": node.name})
    return _serialize_node(node, await has_node_ssh_config(db, node.id))


@router.get("/{node_id}", response_model=NodeOut)
async def get_node(
    node_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> NodeOut:
    node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    return _serialize_node(node, await has_node_ssh_config(db, node.id))


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
