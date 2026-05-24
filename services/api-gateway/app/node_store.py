from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt, encrypt
from app.models import Node, Secret

NODE_SSH_PASSWORD = "ssh_password"
NODE_SSH_PRIVATE_KEY = "ssh_private_key"
NODE_SSH_KNOWN_HOSTS = "ssh_known_hosts"


def node_secret_scope(node_id: UUID) -> str:
    return f"node:{node_id}"


async def get_node_secret(db: AsyncSession, node_id: UUID, name: str) -> str | None:
    row = (
        await db.execute(select(Secret).where(Secret.scope == node_secret_scope(node_id), Secret.name == name))
    ).scalar_one_or_none()
    if not row:
        return None
    try:
        return decrypt(row.ciphertext)
    except Exception:
        return None


async def upsert_node_secret(db: AsyncSession, node_id: UUID, name: str, value: str) -> Secret:
    row = (
        await db.execute(select(Secret).where(Secret.scope == node_secret_scope(node_id), Secret.name == name))
    ).scalar_one_or_none()
    if row:
        row.ciphertext = encrypt(value)
        secret = row
    else:
        secret = Secret(scope=node_secret_scope(node_id), name=name, ciphertext=encrypt(value), owner_id=None)
        db.add(secret)
    await db.flush()
    return secret


async def delete_node_secret(db: AsyncSession, node_id: UUID, name: str) -> None:
    await db.execute(delete(Secret).where(Secret.scope == node_secret_scope(node_id), Secret.name == name))


async def has_node_ssh_config(db: AsyncSession, node_id: UUID) -> bool:
    node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
    if not node or not node.ssh_host or not node.ssh_user:
        return False
    if not node.ssh_auth_type:
        return False
    if node.ssh_auth_type == "password":
        return bool(await get_node_secret(db, node_id, NODE_SSH_PASSWORD))
    if node.ssh_auth_type == "key":
        return bool(await get_node_secret(db, node_id, NODE_SSH_PRIVATE_KEY))
    return False


async def get_node_ssh_payload(db: AsyncSession, node_id: UUID) -> dict[str, Any] | None:
    node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
    if not node:
        return None
    payload: dict[str, Any] = {
        "node_id": str(node.id),
        "host": node.ssh_host,
        "user": node.ssh_user,
        "port": node.ssh_port or 22,
        "auth_type": node.ssh_auth_type or "password",
    }
    password = await get_node_secret(db, node_id, NODE_SSH_PASSWORD)
    private_key = await get_node_secret(db, node_id, NODE_SSH_PRIVATE_KEY)
    known_hosts = await get_node_secret(db, node_id, NODE_SSH_KNOWN_HOSTS)
    if password:
        payload["password"] = password
    if private_key:
        payload["private_key"] = private_key
    if known_hosts:
        payload["known_hosts"] = known_hosts
    return payload


async def set_node_ssh_config(
    db: AsyncSession,
    node: Node,
    *,
    ssh_host: str | None,
    ssh_user: str | None,
    ssh_port: int | None,
    ssh_auth_type: str | None,
    ssh_password: str | None,
    ssh_private_key: str | None,
    ssh_known_hosts: str | None,
) -> None:
    node.ssh_host = ssh_host
    node.ssh_user = ssh_user
    node.ssh_port = ssh_port
    node.ssh_auth_type = ssh_auth_type
    if ssh_password is not None:
        if ssh_password:
            await upsert_node_secret(db, node.id, NODE_SSH_PASSWORD, ssh_password)
        else:
            await delete_node_secret(db, node.id, NODE_SSH_PASSWORD)
    if ssh_private_key is not None:
        if ssh_private_key:
            await upsert_node_secret(db, node.id, NODE_SSH_PRIVATE_KEY, ssh_private_key)
        else:
            await delete_node_secret(db, node.id, NODE_SSH_PRIVATE_KEY)
    if ssh_known_hosts is not None:
        if ssh_known_hosts:
            await upsert_node_secret(db, node.id, NODE_SSH_KNOWN_HOSTS, ssh_known_hosts)
        else:
            await delete_node_secret(db, node.id, NODE_SSH_KNOWN_HOSTS)
