"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  skills: string[];
  enabled: boolean;
  source: string;
};
type RunResult = {
  output: string;
  stop_reason: string;
  pending_tool: { tool: string; skill: string; arguments: Record<string, unknown> } | null;
  steps: { tool: string; arguments: Record<string, unknown>; result: unknown; error: string | null }[];
};

export default function AgentsPage() {
  const qc = useQueryClient();
  const meQ = useQuery<Me>({ queryKey: ["me"], queryFn: () => api<Me>("/v1/auth/me"), retry: false });
  const agentsQ = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/v1/agents"),
    refetchInterval: 5000,
  });

  const modelsQ = useQuery<{ ok: boolean; models: { id: string; provider: string; upstream: string }[]; error?: string }>({
    queryKey: ["models"],
    queryFn: () => api("/v1/models"),
    refetchInterval: 30000,
  });
  const models = modelsQ.data?.models ?? [];

  const [selected, setSelected] = useState("core");
  const [message, setMessage] = useState("");
  const [model, setModel] = useState("claude-sonnet");
  const [result, setResult] = useState<RunResult | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrompt, setEditingPrompt] = useState("");
  const [editingSkills, setEditingSkills] = useState("");
  const [editingEnabled, setEditingEnabled] = useState(true);
  const [createName, setCreateName] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createSkills, setCreateSkills] = useState("");

  const isAdmin = meQ.data?.role === "admin";
  const agents = agentsQ.data ?? [];
  const current = agents.find((a) => a.name === selected);

  useEffect(() => {
    if (!current) return;
    setEditingName(current.name);
    setEditingPrompt(current.system_prompt);
    setEditingSkills(current.skills.join(", "));
    setEditingEnabled(current.enabled);
  }, [current]);

  const create = useMutation({
    mutationFn: () =>
      api<Agent>("/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          system_prompt: createPrompt,
          skills: splitList(createSkills),
          enabled: true,
        }),
      }),
    onSuccess: (agent) => {
      setCreateName("");
      setCreatePrompt("");
      setCreateSkills("");
      setSelected(agent.name);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api<Agent>(`/v1/agents/${selected}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editingName,
          system_prompt: editingPrompt,
          skills: splitList(editingSkills),
          enabled: editingEnabled,
        }),
      }),
    onSuccess: (agent) => {
      setSelected(agent.name);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<Agent>(`/v1/agents/${selected}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/v1/agents/${selected}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setSelected("core");
    },
  });

  const run = useMutation({
    mutationFn: () =>
      api<RunResult>(`/v1/agents/${selected}/run`, {
        method: "POST",
        body: JSON.stringify({ message, model, max_steps: 6 }),
      }),
    onSuccess: (r) => setResult(r),
  });

  const enabledCount = useMemo(() => agents.filter((a) => a.enabled).length, [agents]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Agents</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Live agent catalog</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Agents are persisted in the DB now. Presets seed on boot, admins can add/edit/delete custom agents, and runs still call the same skill tool loop.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Agents total" value={agents.length} />
        <Metric label="Enabled" value={enabledCount} />
        <Metric label="Presets" value={agents.filter((a) => a.source === "preset").length} />
        <Metric label="Manual" value={agents.filter((a) => a.source === "manual").length} />
      </section>

      {isAdmin && (
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm text-white">Create agent</CardTitle>
            <CardDescription>Manual agents are DB-backed and editable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Name">
                <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={createName} onChange={(e) => setCreateName(e.target.value)} />
              </Field>
              <Field label="Skills">
                <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={createSkills} onChange={(e) => setCreateSkills(e.target.value)} placeholder="notes, gmail" />
              </Field>
              <Field label="Enabled">
                <div className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100">true</div>
              </Field>
            </div>
            <Field label="System prompt">
              <textarea className="min-h-24 w-full rounded-xl border border-border bg-bg p-3 text-sm text-slate-100 outline-none" value={createPrompt} onChange={(e) => setCreatePrompt(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !createName.trim() || !createPrompt.trim()}>
                {create.isPending ? "Creating..." : "Create agent"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm text-white">Roster</CardTitle>
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
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{a.name}</div>
                  <Badge variant={a.enabled ? "default" : "secondary"}>{a.enabled ? "on" : "off"}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.skills.slice(0, 4).map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                  {a.skills.length > 4 && <span className="text-[10px] text-muted">+{a.skills.length - 4}</span>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-slate-950/60">
            <CardHeader>
              <CardTitle className="text-sm text-white">Edit agent</CardTitle>
              <CardDescription>
                {current ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{current.source}</Badge>
                    <Badge variant={current.enabled ? "default" : "secondary"}>{current.enabled ? "enabled" : "disabled"}</Badge>
                  </span>
                ) : (
                  "No agent selected"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Name">
                  <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={editingName} onChange={(e) => setEditingName(e.target.value)} disabled={!isAdmin || !current} />
                </Field>
                <Field label="Skills">
                  <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={editingSkills} onChange={(e) => setEditingSkills(e.target.value)} disabled={!isAdmin || !current} />
                </Field>
                <Field label="Enabled">
                  <select className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={String(editingEnabled)} onChange={(e) => setEditingEnabled(e.target.value === "true")} disabled={!isAdmin || !current}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </Field>
              </div>
              <Field label="System prompt">
                <textarea className="min-h-40 w-full rounded-xl border border-border bg-bg p-3 text-sm text-slate-100 outline-none" value={editingPrompt} onChange={(e) => setEditingPrompt(e.target.value)} disabled={!isAdmin || !current} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => run.mutate()} disabled={!message || run.isPending || !current || !current.enabled}>
                  {run.isPending ? "Running…" : "Run"}
                </Button>
                <Button variant="outline" onClick={() => toggle.mutate(!current?.enabled)} disabled={!isAdmin || !current || toggle.isPending}>
                  {current?.enabled ? "Disable" : "Enable"}
                </Button>
                <Button variant="ghost" onClick={() => update.mutate()} disabled={!isAdmin || !current || update.isPending}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => remove.mutate()} disabled={!isAdmin || !current || current.source === "preset" || remove.isPending}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/60">
            <CardHeader>
              <CardTitle className="text-sm text-white">Run prompt</CardTitle>
              <CardDescription>Tool loop runs against the selected DB-backed agent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full min-h-[100px] rounded-lg border border-border bg-bg p-3 text-sm font-mono"
                placeholder="What should the agent do?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  className="rounded-lg border border-border bg-bg px-2 py-1.5 text-xs font-mono"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {models.length === 0 && <option value={model}>{model}</option>}
                  {Object.entries(
                    models.reduce<Record<string, string[]>>((acc, m) => {
                      (acc[m.provider] ||= []).push(m.id);
                      return acc;
                    }, {})
                  ).map(([provider, ids]) => (
                    <optgroup key={provider} label={provider}>
                      {ids.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {modelsQ.data && !modelsQ.data.ok && (
                  <span className="text-[10px] text-amber-400">litellm: {modelsQ.data.error}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card className="border-white/10 bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-sm text-white">Result</CardTitle>
                <CardDescription>
                  stop_reason: <span className="font-mono text-white">{result.stop_reason}</span>
                  {result.pending_tool && <span className="ml-2 text-amber-300">pending: {result.pending_tool.tool}</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.output && <pre className="whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 text-sm">{result.output}</pre>}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
