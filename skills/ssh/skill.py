from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
from typing import Any

import paramiko

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


def _prepare_known_hosts(known_hosts: str) -> tuple[str | None, str | None]:
    value = known_hosts.strip()
    if not value:
        return None, None
    if os.path.exists(value):
        return value, None
    tmp = tempfile.NamedTemporaryFile("w", delete=False)
    tmp.write(value)
    tmp.flush()
    tmp.close()
    return tmp.name, tmp.name


def _parse_stdout(stdout: str, parse_format: str) -> dict[str, Any]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    return {
        "format": parse_format,
        "count": len(lines),
        "items": lines,
    }


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "exec").strip().lower()
    if op not in {"exec", "run"}:
        raise RuntimeError(f"unsupported ssh op '{op}'")

    timeout = max(1, min(int(payload.get("timeout", 60) or 60), 600))
    connect_timeout = max(1, min(int(payload.get("connect_timeout", 15) or 15), 120))
    host = _env_default(payload.get("host"), "SSH_HOST")
    user = _env_default(payload.get("user"), "SSH_USER")
    port = int(payload.get("port") or os.environ.get("SSH_PORT") or "22")
    command = str(payload.get("command") or "").strip()
    if not host:
        raise RuntimeError("ssh requires host")
    if not command:
        raise RuntimeError("ssh requires command")

    password = _env_default(payload.get("password"), "SSH_PASSWORD")
    private_key = _env_default(payload.get("private_key"), "SSH_PRIVATE_KEY")
    private_key_passphrase = _env_default(payload.get("private_key_passphrase"), "SSH_PRIVATE_KEY_PASSPHRASE")
    identity_file = _env_default(payload.get("identity_file"), "SSH_IDENTITY_FILE")
    known_hosts = _env_default(payload.get("known_hosts"), "SSH_KNOWN_HOSTS")
    parse_output = bool(payload.get("parse_output"))
    parse_format = str(payload.get("parse_format") or "lines").strip().lower()
    if parse_format not in {"lines", "docker_names"}:
        parse_format = "lines"
    strict_host_key_checking = str(
        payload.get("strict_host_key_checking", os.environ.get("SSH_STRICT_HOST_KEY_CHECKING", "yes"))
    ).strip().lower()

    def _run() -> dict[str, Any]:
        client = paramiko.SSHClient()
        known_hosts_file, known_hosts_tmp = _prepare_known_hosts(known_hosts or "")
        if known_hosts_file:
            try:
                client.load_host_keys(known_hosts_file)
            except FileNotFoundError:
                pass
        if strict_host_key_checking in {"no", "accept-new"}:
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        else:
            client.set_missing_host_key_policy(paramiko.RejectPolicy())

        temp_key = None
        try:
            key_filename = identity_file
            if private_key and not key_filename:
                temp_key = tempfile.NamedTemporaryFile("w", delete=False)
                temp_key.write(private_key)
                temp_key.flush()
                temp_key.close()
                key_filename = temp_key.name
            client.connect(
                hostname=host,
                port=port,
                username=user or None,
                password=password or None,
                key_filename=key_filename,
                passphrase=private_key_passphrase or None,
                timeout=connect_timeout,
                banner_timeout=connect_timeout,
                auth_timeout=connect_timeout,
                look_for_keys=False,
                allow_agent=False,
            )
            stdin, stdout, stderr = client.exec_command(command, timeout=timeout, get_pty=bool(payload.get("pty")))
            exit_code = stdout.channel.recv_exit_status()
            out = stdout.read().decode()
            err = stderr.read().decode()
            result: dict[str, Any] = {
                "ok": exit_code == 0,
                "exit_code": exit_code,
                "stdout": out,
                "stderr": err,
                "host": host,
                "user": user,
            }
            if parse_output:
                result["parsed_stdout"] = _parse_stdout(out, parse_format)
            return result
        finally:
            client.close()
            if temp_key:
                try:
                    os.unlink(temp_key.name)
                except OSError:
                    pass
            if known_hosts_tmp:
                try:
                    os.unlink(known_hosts_tmp)
                except OSError:
                    pass

    try:
        return await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"ssh command timed out after {timeout}s"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


skill = Skill(
    manifest=SkillManifest(
        name="ssh",
        description="Run a remote command over SSH using saved node host/user and SSH credentials.",
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
            "node_id": {"type": "string"},
            "identity_file": {"type": "string"},
            "password": {"type": "string"},
            "private_key": {"type": "string"},
            "private_key_passphrase": {"type": "string"},
            "known_hosts": {"type": "string"},
            "strict_host_key_checking": {"type": "string", "enum": ["yes", "no", "ask", "accept-new"]},
            "parse_output": {"type": "boolean", "default": False},
            "parse_format": {"type": "string", "enum": ["lines", "docker_names"], "default": "lines"},
            "connect_timeout": {"type": "integer", "default": 15},
            "timeout": {"type": "integer", "default": 60},
            "pty": {"type": "boolean", "default": False},
        },
    ),
    handler=handle,
)
