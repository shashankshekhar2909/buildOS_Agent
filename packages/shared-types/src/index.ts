export type UUID = string;

export type Role = "admin" | "operator" | "viewer";
export type NodeStatus = "online" | "offline" | "degraded";
export type TaskState =
  | "pending"
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type ApprovalState = "pending" | "approved" | "denied" | "expired";

export interface User { id: UUID; email: string; role: Role; is_active: boolean }
export interface Node { id: UUID; name: string; status: NodeStatus; tags: string[]; capabilities: Record<string, unknown>; last_metrics: Record<string, unknown>; last_seen: string | null; created_at: string }
export interface Task { id: UUID; title: string; kind: string; payload: Record<string, unknown>; state: TaskState; node_id: UUID | null; result: Record<string, unknown>; error: string | null; created_at: string }
export interface Approval { id: UUID; task_id: UUID | null; action: string; risk: "low" | "medium" | "high" | "critical"; payload: Record<string, unknown>; state: ApprovalState; created_at: string }
export interface TokenPair { access_token: string; refresh_token: string; token_type: "bearer" }

export interface WSEvent<T = unknown> { event: string; data: T }
