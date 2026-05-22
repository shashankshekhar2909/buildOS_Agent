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


class NodeIn(BaseModel):
    name: str
    tags: list[str] = []


class NodeOut(BaseModel):
    id: UUID
    name: str
    status: str
    tags: list[str]
    capabilities: dict
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


class TaskOut(BaseModel):
    id: UUID
    title: str
    kind: str
    payload: dict
    state: TaskState
    node_id: UUID | None
    result: dict
    error: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ApprovalOut(BaseModel):
    id: UUID
    task_id: UUID | None
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
