"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Node = { id: string; name: string; status: string; last_seen: string | null };
type Task = { id: string; title: string; kind: string; state: string; created_at: string };
type Approval = { id: string; action: string; risk: string; state: string; created_at: string };

export default function AgentsPage() {
  const nodesQ = useQuery<Node[]>({ queryKey: ["nodes"], queryFn: () => api<Node[]>("/v1/nodes"), refetchInterval: 5000 });
  const tasksQ = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api<Task[]>("/v1/tasks"), refetchInterval: 5000 });
  const approvalsQ = useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/v1/approvals"),
    refetchInterval: 5000,
  });

  const nodes = nodesQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const approvals = approvalsQ.data ?? [];

  const summary = useMemo(() => {
    const active = tasks.filter((t) => ["queued", "running", "waiting_approval"].includes(t.state)).length;
    const orchestration = tasks.filter((t) => ["agent", "workflow"].includes(t.kind)).length;
    const online = nodes.filter((n) => n.status === "online").length;
    const pendingApprovals = approvals.filter((a) => a.state === "pending").length;
    return { active, orchestration, online, pendingApprovals };
  }, [nodes, tasks, approvals]);

  const lanes = [
    { label: "Planner", value: "Task engine + queue", tone: "text-indigo-300" },
    { label: "Executor", value: "Node runtime WS", tone: "text-emerald-300" },
    { label: "Gatekeeper", value: "Approvals + RBAC", tone: "text-amber-300" },
    { label: "AI router", value: "LiteLLM gateway", tone: "text-sky-300" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Agents</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Orchestration surface</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              The agent layer is still mostly backend-first. This page shows the current control path:
              tasks, node execution, approvals, and model routing.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/tasks" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white">
              Create task
            </Link>
            <Link href="/approvals" className="rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-white">
              Review approvals
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active work items" value={summary.active} />
        <Metric label="Nodes online" value={summary.online} />
        <Metric label="Orchestration tasks" value={summary.orchestration} />
        <Metric label="Pending approvals" value={summary.pendingApprovals} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => (
          <div key={lane.label} className="rounded-2xl border border-border bg-panel p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">{lane.label}</div>
            <div className={`mt-2 text-lg font-semibold ${lane.tone}`}>{lane.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Live task states">
          <MiniHead columns={["Title", "Kind", "State"]} />
          <div className="divide-y divide-border">
            {tasks.slice(0, 8).map((task) => (
              <MiniRow key={task.id} cols={[task.title, task.kind, <StatePill key="state" v={task.state} />]} />
            ))}
            {tasks.length === 0 && <Empty message="No tasks yet." />}
          </div>
        </Panel>

        <Panel title="Node fleet">
          <MiniHead columns={["Name", "Status", "Last seen"]} />
          <div className="divide-y divide-border">
            {nodes.slice(0, 8).map((node) => (
              <MiniRow
                key={node.id}
                cols={[
                  node.name,
                  <StatePill key="state" v={node.status} />,
                  node.last_seen ? new Date(node.last_seen).toLocaleString() : "—",
                ]}
              />
            ))}
            {nodes.length === 0 && <Empty message="No nodes registered." />}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-panel overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-white">{title}</div>
      {children}
    </section>
  );
}

function MiniHead({ columns }: { columns: string[] }) {
  return (
    <div className="grid gap-3 border-b border-border bg-bg/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column) => (
        <div key={column}>{column}</div>
      ))}
    </div>
  );
}

function MiniRow({ cols }: { cols: React.ReactNode[] }) {
  return (
    <div className="grid gap-3 px-4 py-3 text-sm text-white" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      {cols.map((col, idx) => (
        <div key={idx} className="min-w-0 truncate">
          {col}
        </div>
      ))}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="px-4 py-6 text-sm text-muted">{message}</div>;
}

function StatePill({ v }: { v: string }) {
  const color = {
    online: "bg-emerald-700",
    degraded: "bg-yellow-700",
    queued: "bg-indigo-700",
    running: "bg-sky-700",
    pending: "bg-yellow-700",
    waiting_approval: "bg-yellow-700",
    completed: "bg-emerald-700",
    failed: "bg-red-700",
    cancelled: "bg-neutral-700",
  }[v] || "bg-neutral-700";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs ${color}`}>{v}</span>;
}
