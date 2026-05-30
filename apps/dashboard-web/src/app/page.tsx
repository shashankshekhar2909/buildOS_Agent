"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cpu, ListTodo, ShieldCheck, Workflow, Activity, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { StatePill, RiskPill } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Node = { id: string; name: string; status: string; last_seen: string | null };
type Task = { id: string; title: string; kind: string; state: string; created_at: string };
type Approval = { id: string; action: string; risk: string; state: string; created_at: string };

export default function Overview() {
  const nodesQ = useQuery<Node[]>({ queryKey: ["nodes"], queryFn: () => api<Node[]>("/v1/nodes"), refetchInterval: 5000 });
  const tasksQ = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api<Task[]>("/v1/tasks"), refetchInterval: 5000 });
  const approvalsQ = useQuery<Approval[]>({ queryKey: ["approvals"], queryFn: () => api<Approval[]>("/v1/approvals"), refetchInterval: 5000 });

  const nodes = nodesQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const loading = nodesQ.isLoading || tasksQ.isLoading || approvalsQ.isLoading;

  const stats = useMemo(() => {
    const online = nodes.filter((n) => n.status === "online").length;
    const queued = tasks.filter((t) => t.state === "queued").length;
    const running = tasks.filter((t) => t.state === "running").length;
    const waiting = approvals.filter((a) => a.state === "pending").length;
    const orchestration = tasks.filter((t) => ["agent", "workflow"].includes(t.kind)).length;
    return [
      { label: "Nodes online", value: `${online}/${nodes.length}`, tone: "text-emerald-300", icon: Cpu },
      { label: "Queued tasks", value: String(queued), tone: "text-indigo-300", icon: ListTodo },
      { label: "Running tasks", value: String(running), tone: "text-sky-300", icon: Activity },
      { label: "Pending approvals", value: String(waiting), tone: "text-amber-300", icon: ShieldCheck },
      { label: "Agent flows", value: String(orchestration), tone: "text-violet-300", icon: Workflow },
    ];
  }, [nodes, tasks, approvals]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Control Room"
        title={<>BuildAgent <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-indigo-400">Live Dashboard</span></>}
        description="Real-time monitoring of nodes, tasks, and approvals. Press ⌘K to jump anywhere."
        actions={
          <>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-accent to-[#5d3bf2] px-5 text-sm font-semibold text-white shadow-lg hover:brightness-110 active:scale-[0.98] transition-all" href="/tasks">
              New task
            </Link>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 text-sm font-semibold text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all" href="/nodes">
              View nodes
            </Link>
          </>
        }
      />

      {/* Stats */}
      <section className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px]" />)
          : stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      {/* Tables */}
      <section className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Panel title="Recent Tasks" href="/tasks" cta="Open builder">
          <DataTable<Task, unknown>
            data={tasks.slice(0, 6)}
            emptyTitle="No tasks yet"
            emptyDescription="Create a task to dispatch work to a node."
            columns={[
              { accessorKey: "title", header: "Title", cell: (info) => <span className="font-medium text-slate-200">{String(info.getValue() ?? "")}</span> },
              { accessorKey: "kind", header: "Kind", cell: (info) => <span className="text-xs font-mono text-slate-400">{String(info.getValue() ?? "")}</span> },
              { accessorKey: "state", header: "State", cell: (info) => <StatePill v={String(info.getValue() ?? "")} /> },
            ]}
          />
        </Panel>

        <Panel title="Gatekeeper Approvals" href="/approvals" cta="Open reviews">
          <DataTable<Approval, unknown>
            data={approvals.slice(0, 6)}
            emptyTitle="No pending approvals"
            emptyDescription="Approval prompts appear here when an agent pauses on a risky tool call."
            columns={[
              { accessorKey: "action", header: "Action", cell: (info) => <span className="font-medium text-slate-200">{String(info.getValue() ?? "")}</span> },
              { accessorKey: "risk", header: "Risk", cell: (info) => <RiskPill v={String(info.getValue() ?? "")} /> },
              { accessorKey: "state", header: "State", cell: (info) => <StatePill v={String(info.getValue() ?? "")} /> },
            ]}
          />
        </Panel>
      </section>

      <Panel title="Active Nodes" href="/nodes" cta="Manage fleet">
        <DataTable<Node, unknown>
          data={nodes.slice(0, 8)}
          emptyTitle="No nodes registered"
          emptyDescription="Run the node-runtime with a NODE_TOKEN to register a host."
          columns={[
            { accessorKey: "name", header: "Node name", cell: (info) => <span className="font-semibold text-slate-200">{String(info.getValue() ?? "")}</span> },
            { accessorKey: "status", header: "Status", cell: (info) => <StatePill v={String(info.getValue() ?? "")} /> },
            { accessorKey: "last_seen", header: "Last seen", cell: (info) => {
              const v = info.getValue() as string | null;
              return <span className="text-xs font-mono text-slate-400">{v ? new Date(v).toLocaleString() : "never"}</span>;
            } },
          ]}
        />
      </Panel>
    </div>
  );
}

function Panel({ title, href, cta, children }: { title: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 overflow-hidden shadow-2xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.1]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 bg-white/[0.01]">
        <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>
        <Link className="text-xs text-slate-400 hover:text-accent font-medium transition-colors" href={href}>
          {cta} &rarr;
        </Link>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: LucideIcon }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 backdrop-blur-md transition-all duration-300 hover:border-white/[0.1] hover:bg-slate-950/50">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">{label}</div>
          <div className={cn("mt-2 text-3xl font-bold tracking-tight", tone)}>{value}</div>
        </div>
        <Icon size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </div>
  );
}
