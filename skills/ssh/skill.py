from __future__ import annotations

import asyncio
import os
import shlex
import subprocess
from typing import Any

from skill_sdk import Skill, SkillManifest


def _env_default(value: str | None, env_key: str) -> str | None:
    value = str(value or "").strip()
    if value:
        return value
    fallback = str(os.environ.get(env_key, "")).strip()
    return fallback or None


def _build_ssh_command(payload: dict[str, Any]) -> list[str]:
    host = _env_default(payload.get("host"), "SSH_HOST")
    if not host:
        raise RuntimeError("ssh requires host")

    user = _env_default(payload.get("user"), "SSH_USER")
    port = str(payload.get("port") or os.environ.get("SSH_PORT") or "22").strip()
    command = str(payload.get("command") or "").strip()
    if not command:
        raise RuntimeError("ssh requires command")

    identity_file = _env_default(payload.get("identity_file"), "SSH_IDENTITY_FILE")
    connect_timeout = str(payload.get("connect_timeout") or os.environ.get("SSH_CONNECT_TIMEOUT") or "15").strip()
    known_hosts = _env_default(payload.get("known_hosts"), "SSH_KNOWN_HOSTS")
    strict_host_key_checking = str(payload.get("strict_host_key_checking", os.environ.get("SSH_STRICT_HOST_KEY_CHECKING", "yes"))).strip().lower()
    batch_mode = str(payload.get("batch_mode", True)).strip().lower()

    target = f"{user}@{host}" if user else host
    cmd = [
        "ssh",
        "-p",
        port,
        "-o",
        f"ConnectTimeout={connect_timeout}",
        "-o",
        "ServerAliveInterval=10",
        "-o",
        "ServerAliveCountMax=1",
        "-o",
        f"BatchMode={'yes' if batch_mode not in {'0', 'false', 'no'} else 'no'}",
        "-o",
        f"StrictHostKeyChecking={strict_host_key_checking if strict_host_key_checking in {'yes', 'no', 'ask', 'accept-new'} else 'yes'}",
    ]
    if identity_file:
        cmd.extend(["-i", identity_file])
    if known_hosts:
        cmd.extend(["-o", f"UserKnownHostsFile={known_hosts}"])

    remote_command = command
    if payload.get("pty"):
        cmd.append("-tt")
    cmd.extend([target, remote_command])
    return cmd


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "exec").strip().lower()
    if op not in {"exec", "run"}:
        raise RuntimeError(f"unsupported ssh op '{op}'")

    cmd = _build_ssh_command(payload)
    timeout = max(1, min(int(payload.get("timeout", 60) or 60), 600))

    def _run() -> dict[str, Any]:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {
            "ok": proc.returncode == 0,
            "exit_code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "command": cmd[0] + " " + " ".join(shlex.quote(part) for part in cmd[1:]),
        }

    try:
        return await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"ssh command timed out after {timeout}s"}
    except FileNotFoundError:
        return {"ok": False, "error": "ssh binary not found"}


skill = Skill(
    manifest=SkillManifest(
        name="ssh",
        description="Run a remote command over SSH using the local ssh client.",
        permissions=["ssh.exec"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["exec", "run"]},
            "host": {"type": "string"},
            "user": {"type": "string"},
            "port": {"type": "integer", "default": 22},
            "command": {"type": "string"},
            "identity_file": {"type": "string"},
            "known_hosts": {"type": "string"},
            "strict_host_key_checking": {"type": "string", "enum": ["yes", "no", "ask", "accept-new"]},
            "connect_timeout": {"type": "integer", "default": 15},
            "timeout": {"type": "integer", "default": 60},
            "pty": {"type": "boolean", "default": False},
        },
    ),
    handler=handle,
)
