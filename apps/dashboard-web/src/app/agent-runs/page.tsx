"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

type Step = { tool: string; arguments: Record<string, unknown>; result: unknown; error: string | null };
type Run = {
  id: string;
  agent_name: string;
  model: string;
  initial_message: string;
  state: string;
  stop_reason: string | null;
  output: string | null;
  error: string | null;
  pending_tool: { tool: string; skill: string } | null;
  skills: string[];
  steps: Step[];
  created_at: string;
  updated_at: string;
};

const STATE_COLOR: Record<string, string> = {
  running: "bg-sky-700",
  completed: "bg-emerald-700",
  failed: "bg-red-700",
  waiting_approval: "bg-amber-700",
  cancelled: "bg-neutral-700",
};

export default function AgentRunsPage() {
  const runsQ = useQuery<Run[]>({
    queryKey: ["agent-runs"],
    queryFn: () => api<Run[]>("/v1/agent-runs"),
    refetchInterval: 5000,
  });
  const runs = runsQ.data ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Agent runs</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Execution history</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Every agent invocation. Open one to see the full step trace and resume status.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-panel overflow-hidden">
        <div className="grid grid-cols-[1fr,120px,140px,100px,180px] gap-3 border-b border-border bg-bg/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted">
          <div>Message</div>
          <div>Agent</div>
          <div>State</div>
          <div>Steps</div>
          <div>Created</div>
        </div>
        <div className="divide-y divide-border">
          {runs.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted">No agent runs yet. Run one from /agents.</div>
          )}
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/agent-runs/${r.id}`}
              className="grid grid-cols-[1fr,120px,140px,100px,180px] gap-3 px-4 py-3 text-sm text-white hover:bg-white/[0.03]"
            >
              <div className="min-w-0 truncate" title={r.initial_message}>{r.initial_message}</div>
              <div className="truncate text-slate-300">{r.agent_name}</div>
              <div>
                <span className={`inline-flex rounded px-2 py-0.5 text-xs ${STATE_COLOR[r.state] || "bg-neutral-700"}`}>
                  {r.state}
                </span>
                {r.pending_tool && (
                  <Badge variant="outline" className="ml-2 text-[10px]">{r.pending_tool.skill}</Badge>
                )}
              </div>
              <div className="text-muted">{r.steps?.length ?? 0}</div>
              <div className="text-muted">{new Date(r.created_at).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
