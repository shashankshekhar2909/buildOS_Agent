from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field

from app.models.task import TaskState
from app.models.approval import ApprovalState


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class UserAdminOut(UserOut):
    created_at: datetime


class UserCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "viewer"
    is_active: bool = True


class UserUpdateIn(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    role: str | None = None
    is_active: bool | None = None


class NodeIn(BaseModel):
    name: str
    tags: list[str] = []
    status: str = "offline"
    capabilities: dict = {}
    ssh_host: str | None = None
    ssh_user: str | None = None
    ssh_port: int | None = 22
    ssh_auth_type: str | None = "password"
    ssh_password: str | None = None
    ssh_private_key: str | None = None
    ssh_known_hosts: str | None = None


class NodeUpdateIn(BaseModel):
    name: str | None = None
    tags: list[str] | None = None
    status: str | None = None
    capabilities: dict | None = None
    ssh_host: str | None = None
    ssh_user: str | None = None
    ssh_port: int | None = None
    ssh_auth_type: str | None = None
    ssh_password: str | None = None
    ssh_private_key: str | None = None
    ssh_known_hosts: str | None = None


class NodeOut(BaseModel):
    id: UUID
    name: str
    status: str
    tags: list[str]
    capabilities: dict
    ssh_host: str | None = None
    ssh_user: str | None = None
    ssh_port: int | None = None
    ssh_auth_type: str | None = None
    ssh_configured: bool = False
    last_metrics: dict
    last_seen: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class NodeRegisterOut(BaseModel):
    node: NodeOut
    register_token: str  # one-time, used by node-runtime to authenticate


class TaskIn(BaseModel):
    title: str
    kind: str  # command|skill|agent|workflow
    payload: dict = {}
    node_id: UUID | None = None
    scheduled_at: datetime | None = None
    repeat_every_minutes: int | None = None
    repeat_until: datetime | None = None
    template: str | None = None


class TaskOut(BaseModel):
    id: UUID
    title: str
    kind: str
    payload: dict
    state: TaskState
    node_id: UUID | None
    scheduled_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    result: dict
    error: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ApprovalOut(BaseModel):
    id: UUID
    task_id: UUID | None
    agent_run_id: UUID | None = None
    tool: str | None = None
    tool_call_id: str | None = None
    action: str
    risk: str
    payload: dict
    state: ApprovalState
    created_at: datetime

    class Config:
        from_attributes = True


class ApprovalDecision(BaseModel):
    approve: bool
    note: str | None = None


class SkillOut(BaseModel):
    id: UUID
    name: str
    version: str
    description: str
    permissions: list[str]
    requires_approval: bool
    enabled: bool
    manifest: dict

    class Config:
        from_attributes = True


class SkillPatchIn(BaseModel):
    enabled: bool


class SkillCreateIn(BaseModel):
    name: str
    version: str = "0.1.0"
    description: str = ""
    permissions: list[str] = []
    requires_approval: bool = True
    enabled: bool = True
    manifest: dict = {}


class SkillUpdateIn(BaseModel):
    name: str
    version: str
    description: str
    permissions: list[str]
    requires_approval: bool
    enabled: bool
    manifest: dict = {}


class SkillRunIn(BaseModel):
    payload: dict = Field(default_factory=dict)
