from __future__ import annotations

import io
import json
import os
import tarfile
from pathlib import Path

import docker

from skill_sdk import Skill, SkillManifest

WORKSPACE_ROOT = Path(os.getenv("BUILDAGENT_WORKSPACE_ROOT", "/home/shashank/project/buildOsAgent/.buildagent-files")).resolve()


def _client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc


def _serialize_container(container: docker.models.containers.Container) -> dict:
    attrs = container.attrs or {}
    state = attrs.get("State") or {}
    network_settings = attrs.get("NetworkSettings") or {}
    ports = network_settings.get("Ports") or {}
    return {
        "id": container.id,
        "name": container.name,
        "image": (attrs.get("Config") or {}).get("Image"),
        "status": container.status,
        "state": state.get("Status"),
        "running": bool(state.get("Running")),
        "started_at": state.get("StartedAt"),
        "finished_at": state.get("FinishedAt"),
        "ports": ports,
    }


def _archive_directory(path: Path) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for item in sorted(path.rglob("*")):
            tar.add(item, arcname=str(item.relative_to(path)))
    return buf.getvalue()


def _coerce_ports(raw: object) -> dict[str, tuple[str, int | None] | int | None]:
    if not isinstance(raw, dict):
        return {}
    ports: dict[str, tuple[str, int | None] | int | None] = {}
    for key, value in raw.items():
        container_port = str(key).strip()
        if not container_port:
            continue
        if value in (None, "", 0):
            ports[container_port] = None
            continue
        if isinstance(value, dict):
            host_ip = str(value.get("host_ip") or "0.0.0.0").strip() or "0.0.0.0"
            host_port = value.get("host_port")
            if host_port in (None, "", 0):
                ports[container_port] = (host_ip, None)
            else:
                ports[container_port] = (host_ip, int(host_port))
            continue
        ports[container_port] = int(value)
    return ports


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or payload.get("action") or "").strip().lower()
    name = payload.get("name") or payload.get("container_name")
    image = str(payload.get("image") or "").strip()
    workdir = str(payload.get("workdir") or "").strip()
    commands = payload.get("commands")
    setup_commands = payload.get("setup_commands")
    startup_command = str(payload.get("startup_command") or payload.get("start_command") or "").strip()
    ports = _coerce_ports(payload.get("ports"))
    if not op and (image or commands or name):
        op = "run"

    if op == "ps":
        try:
            client = _client()
            containers = client.containers.list()
            data = [_serialize_container(container) for container in containers]
            return {
                "ok": True,
                "count": len(data),
                "containers": data,
                "stdout": "\n".join(item["name"] for item in data),
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    if op == "run":
        if not image:
            return {"ok": False, "error": "image required"}
        if not isinstance(commands, list) or not commands:
            return {"ok": False, "error": "commands required"}
        bind_workdir = workdir or "/work"
        source_path = None
        if workdir.startswith("/app/"):
            source_path = (WORKSPACE_ROOT / workdir.removeprefix("/app/")).resolve()
        elif workdir.startswith("/app"):
            source_path = (WORKSPACE_ROOT / workdir.removeprefix("/app")).resolve()
        if source_path is None:
            source_path = (WORKSPACE_ROOT / workdir.lstrip("/")).resolve()

        client = _client()
        container_kwargs = {
            "image": image,
            "name": str(name or "").strip() or None,
            "command": ["sh", "-lc", "tail -f /dev/null"],
            "detach": True,
            "working_dir": bind_workdir,
        }

        container = None
        outputs: list[dict] = []
        try:
            container = client.containers.run(**{k: v for k, v in container_kwargs.items() if v is not None})
            if source_path.exists() and source_path.is_dir():
                container.exec_run(["mkdir", "-p", bind_workdir])
                container.put_archive(bind_workdir, _archive_directory(source_path))
            for command in commands:
                cmd = str(command).strip()
                if not cmd:
                    continue
                result = container.exec_run(["sh", "-lc", cmd], workdir=bind_workdir)
                stdout = result.output.decode("utf-8", errors="replace") if isinstance(result.output, bytes) else str(result.output or "")
                outputs.append({"command": cmd, "exit_code": int(result.exit_code), "stdout": stdout})
                if result.exit_code != 0:
                    return {
                        "ok": False,
                        "error": f"command failed: {cmd}",
                        "exit_code": int(result.exit_code),
                        "stdout": "\n".join(item["stdout"] for item in outputs if item.get("stdout")),
                        "commands": outputs,
                        "container_name": container.name,
                        "image": image,
                        "workdir": bind_workdir,
                    }
            return {
                "ok": True,
                "exit_code": 0,
                "stdout": "\n".join(item["stdout"] for item in outputs if item.get("stdout")),
                "commands": outputs,
                "container_name": container.name,
                "image": image,
                "workdir": bind_workdir,
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc), "container_name": str(name or ""), "image": image, "workdir": bind_workdir}
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    if op == "service":
        if not image:
            return {"ok": False, "error": "image required"}
        if not startup_command:
            return {"ok": False, "error": "startup_command required"}
        bind_workdir = workdir or "/work"
        source_path = None
        if workdir.startswith("/app/"):
            source_path = (WORKSPACE_ROOT / workdir.removeprefix("/app/")).resolve()
        elif workdir.startswith("/app"):
            source_path = (WORKSPACE_ROOT / workdir.removeprefix("/app")).resolve()
        if source_path is None:
            source_path = (WORKSPACE_ROOT / workdir.lstrip("/")).resolve()

        client = _client()
        container_kwargs = {
            "image": image,
            "name": str(name or "").strip() or None,
            "command": ["sh", "-lc", "tail -f /dev/null"],
            "detach": True,
            "working_dir": bind_workdir,
            "ports": ports or None,
        }
        container = None
        try:
            container = client.containers.run(**{k: v for k, v in container_kwargs.items() if v is not None})
            if source_path.exists() and source_path.is_dir():
                container.exec_run(["mkdir", "-p", bind_workdir])
                container.put_archive(bind_workdir, _archive_directory(source_path))
            for command in setup_commands or []:
                cmd = str(command).strip()
                if not cmd:
                    continue
                result = container.exec_run(["sh", "-lc", cmd], workdir=bind_workdir)
                if int(result.exit_code) != 0:
                    stdout = result.output.decode("utf-8", errors="replace") if isinstance(result.output, bytes) else str(result.output or "")
                    return {
                        "ok": False,
                        "error": f"setup command failed: {cmd}",
                        "exit_code": int(result.exit_code),
                        "stdout": stdout,
                        "container_name": container.name,
                        "image": image,
                        "workdir": bind_workdir,
                    }
            container.exec_run(["sh", "-lc", f"nohup {startup_command} >/tmp/service.log 2>&1 &"], workdir=bind_workdir)
            container.reload()
            return {
                "ok": True,
                "action": "service",
                "container_name": container.name,
                "image": image,
                "workdir": bind_workdir,
                "ports": (container.attrs or {}).get("NetworkSettings", {}).get("Ports", {}),
                "startup_command": startup_command,
                "setup_commands": [str(cmd) for cmd in (setup_commands or []) if str(cmd).strip()],
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc), "container_name": str(name or ""), "image": image, "workdir": bind_workdir}

    if not name:
        return {"ok": False, "error": "name required"}

    try:
        client = _client()
        container = client.containers.get(name)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    if op == "start":
        try:
            container.start()
            return {"ok": True, "name": container.name, "action": "start"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
    if op == "stop":
        try:
            container.stop()
            return {"ok": True, "name": container.name, "action": "stop"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
    if op == "restart":
        try:
            container.restart()
            return {"ok": True, "name": container.name, "action": "restart"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
    if op == "logs":
        try:
            logs = container.logs(tail=200, timestamps=True)
            if isinstance(logs, bytes):
                logs = logs.decode("utf-8", errors="replace")
            return {"ok": True, "name": container.name, "logs": str(logs)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    return {"ok": False, "error": f"unknown op {op}"}


skill = Skill(
    manifest=SkillManifest(
        name="docker",
        version="1.0.0",
        description="Manage Docker containers on a node.",
        permissions=["docker:read", "docker:write"],
        requires_approval=True,
        risk="high",
        execution="node",
        schema={
            "type": "object",
            "properties": {
                "op": {"type": "string", "enum": ["ps", "run", "start", "stop", "restart", "logs"]},
                "name": {"type": "string"},
                "container_name": {"type": "string"},
                "image": {"type": "string"},
                "workdir": {"type": "string"},
                "commands": {"type": "array", "items": {"type": "string"}},
                "setup_commands": {"type": "array", "items": {"type": "string"}},
                "startup_command": {"type": "string"},
                "start_command": {"type": "string"},
                "ports": {"type": "object"},
            },
            "required": [],
        },
    ),
    handler=handle,
)
