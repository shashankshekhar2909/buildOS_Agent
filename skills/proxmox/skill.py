from __future__ import annotations

import asyncio
import json
import os
import ssl
import urllib.parse
import urllib.request
from typing import Any

from skill_sdk import Skill, SkillManifest

PVE_API = "/api2/json"


def _build_url(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}{PVE_API}{path}"


def _request(
    base_url: str,
    path: str,
    token: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    verify_ssl: bool = True,
) -> dict[str, Any]:
    headers = {"accept": "application/json", "authorization": f"PVEAPIToken={token}"}
    data = None
    if body is not None:
        headers["content-type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(body).encode("utf-8")
    req = urllib.request.Request(_build_url(base_url, path), data=data, headers=headers, method=method)
    ctx = None
    if not verify_ssl:
        ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as res:
        payload = res.read().decode("utf-8")
    data = json.loads(payload) if payload else {}
    return data.get("data", data)


def _resolve_config(payload: dict[str, Any]) -> tuple[str, str, bool]:
    base_url = str(payload.get("base_url") or os.environ.get("PVE_BASE_URL") or "").strip()
    token = str(payload.get("api_token") or os.environ.get("PVE_API_TOKEN") or "").strip()
    if not base_url:
        raise RuntimeError("proxmox requires base_url")
    if not token:
        raise RuntimeError("proxmox requires api_token")
    verify_ssl_raw = str(payload.get("verify_ssl", os.environ.get("PVE_VERIFY_SSL", "true"))).strip().lower()
    verify_ssl = verify_ssl_raw not in {"0", "false", "no"}
    return base_url, token, verify_ssl


async def handle(payload: dict) -> dict:
    op = str(payload.get("op") or "nodes").strip().lower()

    def _run() -> dict[str, Any]:
        base_url, token, verify_ssl = _resolve_config(payload)

        if op == "nodes":
            nodes = _request(base_url, "/nodes", token, verify_ssl=verify_ssl)
            return {"ok": True, "nodes": [_simplify_node(node) for node in nodes]}

        if op == "vms":
            nodes = _request(base_url, "/nodes", token, verify_ssl=verify_ssl)
            items: list[dict[str, Any]] = []
            for node in nodes:
                node_name = str(node.get("node"))
                if not node_name:
                    continue
                qemu = _request(base_url, f"/nodes/{urllib.parse.quote(node_name)}/qemu", token, verify_ssl=verify_ssl)
                lxc = _request(base_url, f"/nodes/{urllib.parse.quote(node_name)}/lxc", token, verify_ssl=verify_ssl)
                items.extend(_simplify_vm(node_name, item, "qemu") for item in qemu)
                items.extend(_simplify_vm(node_name, item, "lxc") for item in lxc)
            return {"ok": True, "result_count": len(items), "vms": items}

        if op == "status":
            node = str(payload.get("node") or "").strip()
            if not node:
                raise RuntimeError("proxmox status requires node")
            status = _request(base_url, f"/nodes/{urllib.parse.quote(node)}/status", token, verify_ssl=verify_ssl)
            return {"ok": True, "node": node, "status": status}

        if op == "vm_status":
            node = str(payload.get("node") or "").strip()
            vmid = str(payload.get("vmid") or "").strip()
            vm_type = str(payload.get("vm_type") or "qemu").strip().lower()
            if not node or not vmid:
                raise RuntimeError("proxmox vm_status requires node and vmid")
            if vm_type not in {"qemu", "lxc"}:
                raise RuntimeError("proxmox vm_type must be qemu or lxc")
            status = _request(
                base_url,
                f"/nodes/{urllib.parse.quote(node)}/{vm_type}/{urllib.parse.quote(vmid)}/status/current",
                token,
                verify_ssl=verify_ssl,
            )
            return {"ok": True, "node": node, "vmid": vmid, "vm_type": vm_type, "status": status}

        if op == "tasks":
            node = str(payload.get("node") or "").strip()
            if not node:
                raise RuntimeError("proxmox tasks requires node")
            tasks = _request(base_url, f"/nodes/{urllib.parse.quote(node)}/tasks", token, verify_ssl=verify_ssl)
            return {"ok": True, "node": node, "result_count": len(tasks), "tasks": tasks}

        raise RuntimeError(f"unsupported proxmox op '{op}'")

    return await asyncio.to_thread(_run)


def _simplify_node(node: dict[str, Any]) -> dict[str, Any]:
    return {
        "node": node.get("node"),
        "status": node.get("status"),
        "online": node.get("online"),
        "level": node.get("level"),
        "type": node.get("type"),
    }


def _simplify_vm(node: str, vm: dict[str, Any], vm_type: str) -> dict[str, Any]:
    return {
        "node": node,
        "vm_type": vm_type,
        "vmid": vm.get("vmid"),
        "name": vm.get("name"),
        "status": vm.get("status"),
        "template": vm.get("template"),
    }


skill = Skill(
    manifest=SkillManifest(
        name="proxmox",
        description="Read-only Proxmox VE API access for nodes, VMs, and task state.",
        permissions=["proxmox.readonly"],
        requires_approval=True,
        risk="high",
        execution="local",
        schema={
            "op": {"type": "string", "enum": ["nodes", "vms", "status", "vm_status", "tasks"]},
            "base_url": {"type": "string", "example": "https://pve.example:8006"},
            "api_token": {"type": "string", "example": "root@pam!token=uuid"},
            "verify_ssl": {"type": "boolean", "default": True},
            "node": {"type": "string"},
            "vmid": {"type": "string"},
            "vm_type": {"type": "string", "enum": ["qemu", "lxc"]},
        },
    ),
    handler=handle,
)
