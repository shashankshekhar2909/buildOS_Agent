"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Agent = { name: string; system_prompt: string; skills: string[] };
type Step = { tool: string; arguments: Record<string, unknown>; result: unknown; error: string | null };
type RunResult = { output: string; stop_reason: string; pending_tool: { tool: string; skill: string; arguments: Record<string, unknown> } | null; steps: Step[] };

export default function AgentsPage() {
  const agentsQ = useQuery<Agent[]>({ queryKey: ["agents"], queryFn: () => api<Agent[]>("/v1/agents") });
  const [selected, setSelected] = useState<string>("core");
  const [message, setMessage] = useState("");
  const [model, setModel] = useState("claude-sonnet");
  const [result, setResult] = useState<RunResult | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api<RunResult>(`/v1/agents/${selected}/run`, {
        method: "POST",
        body: JSON.stringify({ message, model, max_steps: 6 }),
      }),
    onSuccess: (r) => setResult(r),
  });

  const agents = agentsQ.data ?? [];
  const current = agents.find((a) => a.name === selected);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Agents</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Tool-calling orchestration</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Agents reason over skill tools via LiteLLM. Approval-gated skills pause the loop and emit a pending_tool — wire approval flow next.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Roster</CardTitle>
            <CardDescription>Pick an agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {agents.map((a) => (
              <button
                key={a.name}
                onClick={() => setSelected(a.name)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selected === a.name ? "bg-accent/20 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <div className="font-medium">{a.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.skills.slice(0, 4).map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                  {a.skills.length > 4 && <span className="text-[10px] text-muted">+{a.skills.length - 4}</span>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">{current?.name ?? "—"}</CardTitle>
            <CardDescription className="line-clamp-2">{current?.system_prompt}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="w-full min-h-[100px] rounded-lg border border-border bg-bg p-3 text-sm font-mono"
              placeholder="What should the agent do?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                className="rounded-lg border border-border bg-bg px-2 py-1 text-xs font-mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <Button
                onClick={() => run.mutate()}
                disabled={!message || run.isPending}
              >
                {run.isPending ? "Running…" : "Run"}
              </Button>
              {run.error && <span className="text-xs text-red-400">{(run.error as Error).message}</span>}
            </div>
          </CardContent>
        </Card>
      </section>

      {result && (
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Result</CardTitle>
            <CardDescription>
              stop_reason: <span className="font-mono text-white">{result.stop_reason}</span>
              {result.pending_tool && (
                <span className="ml-2 text-amber-300">pending: {result.pending_tool.tool}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.output && (
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 text-sm">{result.output}</pre>
            )}
            <div className="space-y-2">
              {result.steps.map((s, i) => (
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
