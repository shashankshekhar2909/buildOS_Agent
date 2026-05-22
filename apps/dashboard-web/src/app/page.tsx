"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Node = { id: string; name: string; status: string; last_seen: string | null };
type Task = { id: string; title: string; kind: string; state: string; created_at: string };
type Approval = { id: string; action: string; risk: string; state: string; created_at: string };

export default function Overview() {
  const nodesQ = useQuery<Node[]>({
    queryKey: ["nodes"],
    queryFn: () => api<Node[]>("/v1/nodes"),
    refetchInterval: 5000,
  });

  const tasksQ = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api<Task[]>("/v1/tasks"),
    refetchInterval: 5000,
  });

  const approvalsQ = useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/v1/approvals"),
    refetchInterval: 5000,
  });

  const nodes = nodesQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const approvals = approvalsQ.data ?? [];

  const stats = useMemo(() => {
    const online = nodes.filter((n) => n.status === "online").length;
    const queued = tasks.filter((t) => t.state === "queued").length;
    const running = tasks.filter((t) => t.state === "running").length;
    const waiting = approvals.filter((a) => a.state === "pending").length;
    const orchestration = tasks.filter((t) => ["agent", "workflow"].includes(t.kind)).length;
    return [
      { label: "Nodes online", value: `${online}/${nodes.length}`, tone: "text-emerald-300" },
      { label: "Queued tasks", value: String(queued), tone: "text-indigo-300" },
      { label: "Running tasks", value: String(running), tone: "text-sky-300" },
      { label: "Pending approvals", value: String(waiting), tone: "text-amber-300" },
      { label: "Agent flows", value: String(orchestration), tone: "text-violet-300" },
    ];
  }, [nodes, tasks, approvals]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.10),transparent_30%)]" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Control room</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">BuildAgent live dashboard</h1>
            <p className="mt-3 text-sm text-muted leading-6">
              Live node state, task flow, and approvals in one place. Use this to see what the system is doing right now.
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="rounded bg-accent px-4 py-2 text-sm font-medium text-white" href="/tasks">
              New task
            </Link>
            <Link className="rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-white" href="/nodes">
              View nodes
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel title="Agent layer" href="/agents" cta="Open agents">
          <TableHead columns={["Lane", "Live signal"]} />
          <div className="divide-y divide-border">
            <Row cols={["Planner", "Task queue + templates"]} />
            <Row cols={["Executor", `${nodes.filter((n) => n.status === "online").length} nodes online`] } />
            <Row cols={["Gatekeeper", `${approvals.filter((a) => a.state === "pending").length} approvals`] } />
            <Row cols={["Router", "LiteLLM + skills"]} />
          </div>
        </Panel>

        <Panel title="Recent tasks" href="/tasks" cta="Open tasks">
          <TableHead columns={["Title", "Kind", "State", "Created"]} />
          <div className="divide-y divide-border">
            {tasks.slice(0, 6).map((task) => (
              <Row key={task.id} cols={[task.title, task.kind, <StatePill key="state" v={task.state} />, new Date(task.created_at).toLocaleString()]} />
            ))}
            {tasks.length === 0 && <EmptyRow message="No tasks yet." cols={4} />}
          </div>
        </Panel>

        <Panel title="Pending approvals" href="/approvals" cta="Open approvals">
          <TableHead columns={["Action", "Risk", "State", "Created"]} />
          <div className="divide-y divide-border">
            {approvals.slice(0, 6).map((approval) => (
              <Row
                key={approval.id}
                cols={[
                  approval.action,
                  <RiskPill key="risk" v={approval.risk} />,
                  <StatePill key="state" v={approval.state} />,
                  new Date(approval.created_at).toLocaleString(),
                ]}
              />
            ))}
            {approvals.length === 0 && <EmptyRow message="No approvals waiting." cols={4} />}
          </div>
        </Panel>
      </section>

      <Panel title="Nodes" href="/nodes" cta="Open nodes">
        <TableHead columns={["Name", "Status", "Last seen"]} />
        <div className="divide-y divide-border">
          {nodes.slice(0, 8).map((node) => (
            <Row
              key={node.id}
              cols={[
                node.name,
                <StatePill key="state" v={node.status} />,
                node.last_seen ? new Date(node.last_seen).toLocaleString() : "—",
              ]}
            />
          ))}
          {nodes.length === 0 && <EmptyRow message="No nodes registered." cols={3} />}
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <Link className="text-xs text-muted hover:text-white" href={href}>
          {cta}
        </Link>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function TableHead({ columns }: { columns: string[] }) {
  return (
    <div className="grid gap-3 border-b border-border bg-bg/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column) => (
        <div key={column}>{column}</div>
      ))}
    </div>
  );
}

function Row({ cols }: { cols: React.ReactNode[] }) {
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

function EmptyRow({ message, cols }: { message: string; cols: number }) {
  return (
    <div className="px-4 py-6 text-sm text-muted" style={{ gridColumn: `span ${cols}` }}>
      {message}
    </div>
  );
}

function StatePill({ v }: { v: string }) {
  const color = {
    online: "bg-emerald-700",
    degraded: "bg-yellow-700",
    queued: "bg-indigo-700",
    running: "bg-sky-700",
    pending: "bg-yellow-700",
    completed: "bg-emerald-700",
    failed: "bg-red-700",
    cancelled: "bg-neutral-700",
  }[v] || "bg-neutral-700";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs ${color}`}>{v}</span>;
}

function RiskPill({ v }: { v: string }) {
  const color = {
    low: "bg-neutral-700",
    medium: "bg-yellow-700",
    high: "bg-orange-700",
    critical: "bg-red-700",
  }[v] || "bg-neutral-700";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs ${color}`}>{v}</span>;
}
