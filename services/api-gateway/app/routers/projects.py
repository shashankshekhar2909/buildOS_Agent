from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.db import get_db
from app.dispatcher import dispatch
from app.events import publish
from app.llm_store import default_agent_model
from app.skill_runtime import run_skill
from app.models import AuditLog, Project, Task, TaskState, User
from app.schemas import ProjectIn, ProjectOut, ProjectUpdateIn, TaskOut

router = APIRouter(prefix="/v1/projects", tags=["projects"])

BUILD_SKILLS = ["filesystem", "ssh", "docker"]
WORKSPACE_ROOT = Path(os.getenv("BUILDAGENT_WORKSPACE_ROOT", "/home/shashank/project/buildOsAgent/.buildagent-files")).resolve()
PREVIEW_PORT_START = int(os.getenv("PROJECT_PREVIEW_PORT_START", "5000"))
PREVIEW_PORT_END = int(os.getenv("PROJECT_PREVIEW_PORT_END", "5999"))


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _normalize_lines(values: list[str] | None) -> list[str]:
    if not values:
        return []
    return [item.strip() for item in values if str(item).strip()]


def _build_prompt(project: Project) -> str:
    workspace = project.workspace_path or f"projects/{project.name}"
    parts = [
        f"Project name: {project.name}",
        f"Project type: {project.project_type}",
        f"Stack: {project.stack or 'unspecified'}",
        f"Repository: {project.repo_url or 'unspecified'}",
        f"Workspace path: {workspace}",
        f"Node: {project.node_id or 'none'}",
        f"Brief: {project.brief or 'none'}",
        f"Features: {', '.join(project.features or []) or 'none'}",
        f"Constraints: {', '.join(project.constraints or []) or 'none'}",
        f"Build command: {project.build_command or 'none'}",
        f"Test command: {project.test_command or 'none'}",
        f"Run command: {project.run_command or 'none'}",
        f"Deploy command: {project.deploy_command or 'none'}",
        "",
        "Do this:",
        "1. inspect the repo or workspace",
        "2. implement the requested project brief",
        "3. run tests/build checks",
        "4. if a build command is provided, run it from the right subdirectory",
        "5. summarize what changed and what still blocks release",
        "",
        f"Workspace root is {WORKSPACE_ROOT} and project workspace is {workspace}.",
        f"Use the workspace path {workspace} for filesystem reads and writes.",
        "Use filesystem for repo changes, ssh for remote node access, and docker for container checks.",
    ]
    return "\n".join(parts)


def _serialize(project: Project) -> ProjectOut:
    return ProjectOut.model_validate(project)


def _used_preview_ports() -> set[int]:
    used: set[int] = set()
    client = None
    try:
        import docker

        client = docker.from_env()
        for container in client.containers.list(all=True):
            attrs = container.attrs or {}
            ports = ((attrs.get("NetworkSettings") or {}).get("Ports") or {})
            for bindings in ports.values():
                if not isinstance(bindings, list):
                    continue
                for binding in bindings:
                    if not isinstance(binding, dict):
                        continue
                    try:
                        used.add(int(binding.get("HostPort")))
                    except Exception:
                        continue
    except Exception:
        return used
    finally:
        try:
            if client is not None:
                client.close()
        except Exception:
            pass
    return used


def _allocate_preview_port(preferred: int | None = None) -> int:
    used = _used_preview_ports()
    if preferred is not None and PREVIEW_PORT_START <= preferred <= PREVIEW_PORT_END and preferred not in used:
        return preferred
    for port in range(PREVIEW_PORT_START, PREVIEW_PORT_END + 1):
        if port not in used:
            return port
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "no preview ports available")


def _ensure_scaffold(workspace_dir: Path) -> None:
    frontend = workspace_dir / "frontend"
    backend = workspace_dir / "backend"
    frontend.mkdir(parents=True, exist_ok=True)
    backend.mkdir(parents=True, exist_ok=True)
    (frontend / "app").mkdir(parents=True, exist_ok=True)
    (frontend / "public").mkdir(parents=True, exist_ok=True)

    files = {
        frontend / "package.json": """{
  "name": "smoke-project-frontend",
  "private": true,
  "scripts": {
    "build": "node -e \\"console.log('frontend build ok')\\"",
    "start": "node -e \\"console.log('frontend start ok')\\"",
    "test": "node -e \\"console.log('frontend test ok')\\""
  }
}
""",
        frontend / "Dockerfile": """FROM node:18
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 3000
CMD [\"npm\", \"run\", \"start\"]
""",
        frontend / "app" / "page.tsx": """export default function Page() {
  return <main>Smoke project</main>;
}
""",
        backend / "main.py": """from fastapi import FastAPI

app = FastAPI()


@app.get('/health')
def health():
    return {'ok': True}
""",
        backend / "Dockerfile": """FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD [\"python\", \"-m\", \"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]
""",
        backend / "requirements.txt": "fastapi\nuvicorn\n",
        workspace_dir / "docker-compose.yml": f"""services:
  frontend:
    image: node:18
    working_dir: /app/frontend
    command: sh -lc \"npm install --no-audit --no-fund && npm run start\"
    ports:
      - \"3000:3000\"
  backend:
    image: python:3.12-slim
    working_dir: /app/backend
    command: sh -lc \"pip install --no-cache-dir -r requirements.txt && python -m uvicorn main:app --host 0.0.0.0 --port 8000\"
    ports:
      - \"8000:8000\"
""",
    }
    for path, content in files.items():
        path.write_text(content, encoding="utf-8")


async def _build_project_workspace(project: Project) -> dict:
    workspace_path = project.workspace_path or f"projects/{project.name}"
    workspace_dir = (WORKSPACE_ROOT / workspace_path).resolve()
    workspace_dir.mkdir(parents=True, exist_ok=True)
    _ensure_scaffold(workspace_dir)

    frontend_result = await run_skill(
        "docker",
        {
            "op": "run",
            "image": "node:18",
            "workdir": f"/app/{workspace_path}/frontend",
            "commands": ["npm install", "npm run build"],
            "container_name": f"{project.name}-frontend-build-{uuid4().hex[:8]}",
        },
    )
    backend_result = await run_skill(
        "docker",
        {
            "op": "run",
            "image": "python:3.12-slim",
            "workdir": f"/app/{workspace_path}/backend",
            "commands": ["python -m py_compile main.py"],
            "container_name": f"{project.name}-backend-check-{uuid4().hex[:8]}",
        },
    )
    frontend_preview = None
    backend_preview = None
    if frontend_result.get("ok") and backend_result.get("ok"):
        frontend_port = _allocate_preview_port()
        backend_port = _allocate_preview_port(frontend_port + 1)
        frontend_preview = await run_skill(
            "docker",
            {
                "op": "service",
                "image": "node:18",
                "workdir": f"/app/{workspace_path}/frontend",
                "setup_commands": ["npm install --no-audit --no-fund"],
                "startup_command": "npm run start",
                "ports": {"3000/tcp": {"host_ip": "0.0.0.0", "host_port": frontend_port}},
                "container_name": f"{project.name}-frontend-preview-{uuid4().hex[:8]}",
            },
        )
        backend_preview = await run_skill(
            "docker",
            {
                "op": "service",
                "image": "python:3.12-slim",
                "workdir": f"/app/{workspace_path}/backend",
                "setup_commands": ["pip install --no-cache-dir -r requirements.txt"],
                "startup_command": "python -m uvicorn main:app --host 0.0.0.0 --port 8000",
                "ports": {"8000/tcp": {"host_ip": "0.0.0.0", "host_port": backend_port}},
                "container_name": f"{project.name}-backend-preview-{uuid4().hex[:8]}",
            },
        )

    def _host_port(port_map: object, key: str) -> int | None:
        if not isinstance(port_map, dict):
            return None
        values = port_map.get(key)
        if not isinstance(values, list) or not values:
            return None
        first = values[0] or {}
        try:
            return int(first.get("HostPort"))
        except Exception:
            return None

    return {
        "workspace_path": workspace_path,
        "workspace_root": str(WORKSPACE_ROOT),
        "frontend": frontend_result,
        "backend": backend_result,
        "preview": {
            "frontend": frontend_preview,
            "backend": backend_preview,
            "frontend_port": _host_port((frontend_preview or {}).get("ports"), "3000/tcp"),
            "backend_port": _host_port((backend_preview or {}).get("ports"), "8000/tcp"),
            "port_range": [PREVIEW_PORT_START, PREVIEW_PORT_END],
        },
    }


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[ProjectOut]:
    rows = (await db.execute(select(Project).order_by(Project.created_at.desc()))).scalars().all()
    return [_serialize(row) for row in rows]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> ProjectOut:
    project = Project(
        name=body.name,
        project_type=body.project_type,
        stack=body.stack,
        brief=body.brief,
        features=_normalize_lines(body.features),
        constraints=_normalize_lines(body.constraints),
        repo_url=_clean_text(body.repo_url),
        workspace_path=_clean_text(body.workspace_path),
        node_id=body.node_id,
        build_command=_clean_text(body.build_command),
        test_command=_clean_text(body.test_command),
        run_command=_clean_text(body.run_command),
        deploy_command=_clean_text(body.deploy_command),
        status=body.status or "draft",
        created_by=user.id,
    )
    db.add(project)
    db.add(AuditLog(actor_id=user.id, action="project.create", target_kind="project", target_id=body.name))
    await db.commit()
    await db.refresh(project)
    await publish("project.created", {"id": str(project.id), "name": project.name})
    return _serialize(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> ProjectOut:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "project not found")
    return _serialize(project)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    body: ProjectUpdateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> ProjectOut:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "project not found")
    if body.name is not None:
        project.name = body.name
    if body.project_type is not None:
        project.project_type = body.project_type
    if body.stack is not None:
        project.stack = body.stack
    if body.brief is not None:
        project.brief = body.brief
    if body.features is not None:
        project.features = _normalize_lines(body.features)
    if body.constraints is not None:
        project.constraints = _normalize_lines(body.constraints)
    if body.repo_url is not None:
        project.repo_url = _clean_text(body.repo_url)
    if body.workspace_path is not None:
        project.workspace_path = _clean_text(body.workspace_path)
    if body.node_id is not None:
        project.node_id = body.node_id
    if body.build_command is not None:
        project.build_command = _clean_text(body.build_command)
    if body.test_command is not None:
        project.test_command = _clean_text(body.test_command)
    if body.run_command is not None:
        project.run_command = _clean_text(body.run_command)
    if body.deploy_command is not None:
        project.deploy_command = _clean_text(body.deploy_command)
    if body.status is not None:
        project.status = body.status
    db.add(AuditLog(actor_id=user.id, action="project.update", target_kind="project", target_id=project_id))
    await db.commit()
    await db.refresh(project)
    await publish("project.updated", {"id": project_id, "name": project.name})
    return _serialize(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "project not found")
    await db.delete(project)
    db.add(AuditLog(actor_id=user.id, action="project.delete", target_kind="project", target_id=project_id))
    await db.commit()
    await publish("project.deleted", {"id": project_id})


@router.post("/{project_id}/build", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def build_project(
    project_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> TaskOut:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "project not found")
    workspace_path = project.workspace_path or f"projects/{project.name}"
    project.workspace_path = workspace_path
    (WORKSPACE_ROOT / workspace_path).mkdir(parents=True, exist_ok=True)

    project.status = "building"
    task = Task(
        title=f"Build project: {project.name}",
        kind="agent",
        payload={
            "agent_name": "dev",
            "model": default_agent_model(),
            "message": _build_prompt(project),
            "skill_names": BUILD_SKILLS,
            "max_steps": 24,
            "project_id": str(project.id),
            "project_name": project.name,
            "project_type": project.project_type,
            "project_stack": project.stack,
            "project_brief": project.brief,
            "project_features": project.features,
            "project_constraints": project.constraints,
            "repo_url": project.repo_url,
            "workspace_path": workspace_path,
            "node_id": str(project.node_id) if project.node_id else None,
            "build_command": project.build_command,
            "test_command": project.test_command,
            "run_command": project.run_command,
            "deploy_command": project.deploy_command,
        },
        created_by=user.id,
        state=TaskState.running,
        started_at=datetime.now(tz=timezone.utc),
    )
    db.add(task)
    await db.flush()
    project.last_task_id = task.id
    db.add(AuditLog(actor_id=user.id, action="project.build", target_kind="project", target_id=project_id))
    task.result = {"ok": True, "stage": "starting"}
    await db.commit()
    await db.refresh(task)
    await publish("task.created", {"id": str(task.id), "kind": task.kind, "state": task.state.value, "project_id": project_id})
    build_result = await _build_project_workspace(project)
    frontend_ok = bool((build_result.get("frontend") or {}).get("ok"))
    backend_ok = bool((build_result.get("backend") or {}).get("ok"))
    preview_frontend_ok = bool(((build_result.get("preview") or {}).get("frontend") or {}).get("ok"))
    preview_backend_ok = bool(((build_result.get("preview") or {}).get("backend") or {}).get("ok"))
    task.result = {
        "ok": frontend_ok and backend_ok and preview_frontend_ok and preview_backend_ok,
        "project": project.name,
        **build_result,
    }
    if frontend_ok and backend_ok and preview_frontend_ok and preview_backend_ok:
        task.state = TaskState.completed
        task.error = None
        project.status = "running"
    else:
        task.state = TaskState.failed
        task.error = "project build failed"
        project.status = "failed"
    task.finished_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)
