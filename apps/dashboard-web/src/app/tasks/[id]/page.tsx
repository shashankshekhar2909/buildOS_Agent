"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpBanner } from "@/components/help-banner";

type Task = {
  id: string;
  title: string;
  kind: string;
  payload: Record<string, unknown>;
  state: string;
  node_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const taskQ = useQuery<Task>({
    queryKey: ["task", id],
    queryFn: () => api<Task>(`/v1/tasks/${id}`),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: 15000,
  });

  if (!taskQ.data) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  const task = taskQ.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Task</p>
          <h1 className="mt-2 text-2xl font-semibold text-white break-words">{task.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge variant="secondary">{task.kind}</Badge>
            <Badge variant="outline" className="font-mono">{task.state}</Badge>
            {task.node_id && <Badge variant="outline" className="font-mono">node {task.node_id}</Badge>}
            {task.scheduled_at && <span>scheduled {new Date(task.scheduled_at).toLocaleString()}</span>}
            <span>created {new Date(task.created_at).toLocaleString()}</span>
          </div>
        </div>
        <Link href="/tasks" className="text-xs text-slate-400 hover:text-white">
          ← back
        </Link>
      </div>

      <HelpBanner
        title="SSH result"
        description="This page shows the raw task payload and execution result. For SSH runs, node creds are injected from the saved node record."
        bullets={[
          "If the task failed, check the error block first.",
          "If it completed, the command output is in result.stdout.",
          "Saved node password/key is used automatically.",
        ]}
        href="/nodes"
        hrefLabel="Open nodes"
      />

      {task.error && (
        <Card className="border-red-500/40 bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-red-200">Error</CardTitle>
            <CardDescription className="text-red-300">Execution failed for this task.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs text-red-200">{task.error}</pre>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Payload</CardTitle>
            <CardDescription>Input sent to the dispatcher.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">{JSON.stringify(task.payload, null, 2)}</pre>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Result</CardTitle>
            <CardDescription>Execution output from the node or skill runtime.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs text-emerald-200">
              {JSON.stringify(task.result, null, 2)}
            </pre>
            <ParsedOutput data={task.result} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-sm">Timeline</CardTitle>
          <CardDescription>Lifecycle timestamps for this task.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Metric label="Created" value={new Date(task.created_at).toLocaleString()} />
          <Metric label="Started" value={task.started_at ? new Date(task.started_at).toLocaleString() : "—"} />
          <Metric label="Finished" value={task.finished_at ? new Date(task.finished_at).toLocaleString() : "—"} />
          <Metric label="State" value={task.state} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-white break-words">{value}</div>
    </div>
  );
}

function ParsedOutput({ data }: { data: unknown }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const parsed = (data as Record<string, unknown>).parsed_stdout;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const payload = parsed as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items.map((item) => String(item)).filter(Boolean) : [];
  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted">
        Parsed stdout
      </div>
      <div className="px-3 py-2 text-[11px] text-muted">
        format {String(payload.format ?? "lines")} · {String(payload.count ?? items.length)} items
      </div>
      <div className="max-h-64 overflow-auto divide-y divide-border">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="px-3 py-2 font-mono text-xs text-emerald-200 break-all">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
