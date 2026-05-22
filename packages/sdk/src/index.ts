import type { Node, Task, Approval, TokenPair } from "@buildagent/shared-types";

export class BuildAgentClient {
  constructor(private baseUrl: string, private token?: string) {}

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : await res.json();
  }

  setToken(t: string) { this.token = t; }
  login(email: string, password: string) { return this.req<TokenPair>("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); }
  me() { return this.req<{ id: string; email: string; role: string }>("/v1/auth/me"); }
  listNodes() { return this.req<Node[]>("/v1/nodes"); }
  createNode(name: string, tags: string[] = []) { return this.req<{ node: Node; register_token: string }>("/v1/nodes", { method: "POST", body: JSON.stringify({ name, tags }) }); }
  listTasks() { return this.req<Task[]>("/v1/tasks"); }
  createTask(t: { title: string; kind: string; payload?: any; node_id?: string }) { return this.req<Task>("/v1/tasks", { method: "POST", body: JSON.stringify(t) }); }
  listApprovals() { return this.req<Approval[]>("/v1/approvals"); }
  decideApproval(id: string, approve: boolean, note?: string) { return this.req<Approval>(`/v1/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ approve, note }) }); }
}
