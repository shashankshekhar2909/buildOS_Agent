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
    <div className="space-y-8">
      {/* Premium Ambient Header Control Room Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/40 p-6 md:p-8 backdrop-blur-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.15),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.06),transparent_35%)]" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Control Room</span>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight text-white font-sans">
              BuildAgent <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-indigo-400">Live Dashboard</span>
            </h1>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed font-sans">
              Real-time monitoring of node deployments, task orchestrations, and secure gatekeeper approvals.
              Access live logs and audit trails from one unified terminal.
            </p>
          </div>
          <div className="flex gap-3 relative z-10 shrink-0">
            <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-accent to-[#5d3bf2] px-5 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-glow-accent hover:brightness-110 active:scale-[0.98] transition-all" href="/tasks">
              New task
            </Link>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all" href="/nodes">
              View nodes
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Dashboard Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
        ))}
      </section>

      {/* Main 3-column Workspace Panels */}
      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Agent Layer" href="/agents" cta="Open catalog">
          <TableHead columns={["Lane", "Signal"]} />
          <div className="divide-y divide-white/[0.04]">
            <Row cols={[
              <span key="lane" className="font-semibold text-slate-200">Planner</span>,
              <span key="signal" className="text-xs font-mono text-slate-400">Task queue + templates</span>
            ]} />
            <Row cols={[
              <span key="lane" className="font-semibold text-slate-200">Executor</span>,
              <span key="signal" className="text-xs font-mono text-emerald-400 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse status-glow-emerald" />{nodes.filter((n) => n.status === "online").length} nodes online</span>
            ]} />
            <Row cols={[
              <span key="lane" className="font-semibold text-slate-200">Gatekeeper</span>,
              <span key="signal" className="text-xs font-mono text-amber-400 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse status-glow-amber" />{approvals.filter((a) => a.state === "pending").length} approvals</span>
            ]} />
            <Row cols={[
              <span key="lane" className="font-semibold text-slate-200">Router</span>,
              <span key="signal" className="text-xs font-mono text-slate-400">LiteLLM + skills</span>
            ]} />
          </div>
        </Panel>

        <Panel title="Recent Tasks" href="/tasks" cta="Open builder">
          <TableHead columns={["Title", "Kind", "State"]} />
          <div className="divide-y divide-white/[0.04]">
            {tasks.slice(0, 5).map((task) => (
              <Row key={task.id} cols={[
                <div key="title" className="truncate font-medium text-slate-200">{task.title}</div>,
                <span key="kind" className="text-xs font-mono text-slate-400">{task.kind}</span>,
                <StatePill key="state" v={task.state} />
              ]} />
            ))}
            {tasks.length === 0 && <EmptyRow message="No tasks created yet." cols={3} />}
          </div>
        </Panel>

        <Panel title="Gatekeeper Approvals" href="/approvals" cta="Open reviews">
          <TableHead columns={["Action", "Risk", "State"]} />
          <div className="divide-y divide-white/[0.04]">
            {approvals.slice(0, 5).map((approval) => (
              <Row
                key={approval.id}
                cols={[
                  <div key="action" className="truncate font-medium text-slate-200">{approval.action}</div>,
                  <RiskPill key="risk" v={approval.risk} />,
                  <StatePill key="state" v={approval.state} />
                ]}
              />
            ))}
            {approvals.length === 0 && <EmptyRow message="No pending approvals." cols={3} />}
          </div>
        </Panel>
      </section>

      {/* Fleet Nodes Panel */}
      <Panel title="Active Nodes" href="/nodes" cta="Manage fleet">
        <TableHead columns={["Node Name", "Status", "Last Seen"]} />
        <div className="divide-y divide-white/[0.04]">
          {nodes.slice(0, 6).map((node) => (
            <Row
              key={node.id}
              cols={[
                <span key="name" className="font-semibold text-slate-200">{node.name}</span>,
                <StatePill key="state" v={node.status} />,
                <span key="seen" className="text-xs font-mono text-slate-400">{node.last_seen ? new Date(node.last_seen).toLocaleString() : "never"}</span>
              ]}
            />
          ))}
          {nodes.length === 0 && <EmptyRow message="No registered nodes in database." cols={3} />}
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
    <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 overflow-hidden shadow-2xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.1]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 bg-white/[0.01]">
        <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>
        <Link className="text-xs text-slate-400 hover:text-accent font-medium transition-colors" href={href}>
          {cta} &rarr;
        </Link>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/40 p-5 backdrop-blur-md shadow-2xl transition-all duration-300 hover:border-white/[0.1] hover:bg-slate-950/50">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-2.5 text-3xl font-bold tracking-tight ${tone}`}>{value}</div>
    </div>
  );
}

function TableHead({ columns }: { columns: string[] }) {
  return (
    <div className="grid gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column) => (
        <div key={column}>{column}</div>
      ))}
    </div>
  );
}

function Row({ cols }: { cols: React.ReactNode[] }) {
  return (
    <div className="grid gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.02] transition-colors items-center" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
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
    <div className="px-4 py-6 text-xs text-slate-400 font-mono text-center" style={{ gridColumn: `span ${cols}` }}>
      {message}
    </div>
  );
}

function StatePill({ v }: { v: string }) {
  const styles = ({
    online: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.08)]",
    completed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.08)]",
    degraded: "border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.08)]",
    pending: "border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.08)]",
    queued: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.08)]",
    running: "border-sky-500/20 bg-sky-500/10 text-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.1)] animate-pulse",
    failed: "border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.08)]",
    cancelled: "border-white/10 bg-white/5 text-slate-400",
  } as Record<string, string>)[v] || "border-white/10 bg-white/5 text-slate-400";
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${styles}`}>{v}</span>;
}

function RiskPill({ v }: { v: string }) {
  const styles = ({
    low: "border-white/10 bg-white/5 text-slate-400",
    medium: "border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.08)]",
    high: "border-orange-500/20 bg-orange-500/10 text-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.08)]",
    critical: "border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.1)] font-bold animate-pulse",
  } as Record<string, string>)[v] || "border-white/10 bg-white/5 text-slate-400";
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${styles}`}>{v}</span>;
}
