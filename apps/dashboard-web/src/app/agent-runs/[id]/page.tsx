"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Step = { tool: string; arguments: Record<string, unknown>; result: unknown; error: string | null };
type Msg = { role: string; content: string | null; tool_call_id?: string; name?: string; tool_calls?: unknown };
type Run = {
  id: string;
  agent_name: string;
  model: string;
  initial_message: string;
  state: string;
  stop_reason: string | null;
  output: string | null;
  error: string | null;
  pending_tool: { tool: string; skill: string; arguments: Record<string, unknown>; tool_call_id: string } | null;
  skills: string[];
  steps: Step[];
  messages: Msg[];
  created_at: string;
  updated_at: string;
};

type Approval = {
  id: string;
  agent_run_id: string | null;
  task_id: string | null;
  tool: string | null;
  action: string;
  risk: string;
  payload: Record<string, unknown>;
  state: string;
  created_at: string;
};

const STATE_COLOR: Record<string, string> = {
  running: "bg-sky-700",
  completed: "bg-emerald-700",
  failed: "bg-red-700",
  waiting_approval: "bg-amber-700",
  cancelled: "bg-neutral-700",
};

export default function AgentRunDetail() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const id = params.id;

  const runQ = useQuery<Run>({
    queryKey: ["agent-run", id],
    queryFn: () => api<Run>(`/v1/agent-runs/${id}`),
    refetchInterval: 3000,
    enabled: Boolean(id),
  });

  const approvalsQ = useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/v1/approvals"),
    refetchInterval: 3000,
  });

  const linkedApproval = approvalsQ.data?.find((a) => a.agent_run_id === id && a.state === "pending");

  const decide = useMutation({
    mutationFn: ({ approvalId, approve }: { approvalId: string; approve: boolean }) =>
      api(`/v1/approvals/${approvalId}/decide`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-run", id] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  if (!runQ.data) {
    return <div className="p-6 text-muted">Loading…</div>;
  }
  const run = runQ.data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Run</p>
            <h1 className="mt-2 text-2xl font-semibold text-white break-words">{run.initial_message}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge variant="secondary">{run.agent_name}</Badge>
              <Badge variant="outline" className="font-mono">{run.model}</Badge>
              <span className={`rounded px-2 py-0.5 ${STATE_COLOR[run.state] || "bg-neutral-700"}`}>{run.state}</span>
              {run.stop_reason && <span>stop: {run.stop_reason}</span>}
              <span>· {new Date(run.created_at).toLocaleString()}</span>
            </div>
          </div>
          <Link href="/agent-runs" className="text-xs text-muted hover:text-white">← back</Link>
        </div>
      </section>

      {linkedApproval && (
        <Card className="border-amber-500/40 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-sm text-amber-200">Approval required</CardTitle>
            <CardDescription>
              Tool <span className="font-mono">{linkedApproval.tool}</span> needs human approval before the loop resumes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="rounded-lg border border-border bg-bg p-3 text-xs overflow-x-auto">
              {JSON.stringify(linkedApproval.payload, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button
                onClick={() => decide.mutate({ approvalId: linkedApproval.id, approve: true })}
                disabled={decide.isPending}
                className="bg-emerald-700 hover:bg-emerald-600"
              >
                Approve & resume
              </Button>
              <Button
                onClick={() => decide.mutate({ approvalId: linkedApproval.id, approve: false })}
                disabled={decide.isPending}
                variant="outline"
              >
                Deny
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {run.output && (
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 text-sm">{run.output}</pre>
          </CardContent>
        </Card>
      )}

      {run.error && (
        <Card className="border-red-500/40 bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-red-200">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-xs text-red-300">{run.error}</pre>
          </CardContent>
        </Card>
      )}

      <Card className="border-white/10 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-sm">Steps ({run.steps?.length ?? 0})</CardTitle>
          <CardDescription>Tools fired by the agent, oldest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(run.steps ?? []).length === 0 && <div className="text-xs text-muted">No tool calls yet.</div>}
          {(run.steps ?? []).map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-bg p-3 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="secondary">{i + 1}</Badge>
                <span className="font-mono text-white">{s.tool}</span>
                {s.error && <Badge className="bg-red-700">err</Badge>}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <pre className="overflow-x-auto text-muted">{JSON.stringify(s.arguments, null, 2)}</pre>
                <pre className="overflow-x-auto text-emerald-300">{JSON.stringify(s.result ?? s.error, null, 2)}</pre>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <details className="rounded-2xl border border-border bg-panel p-4 text-xs">
        <summary className="cursor-pointer text-muted">Raw message log ({run.messages?.length ?? 0})</summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-border bg-bg p-3">
          {JSON.stringify(run.messages, null, 2)}
        </pre>
      </details>
    </div>
  );
}
