"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, api, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { HelpBanner } from "@/components/help-banner";
import { cn } from "@/lib/utils";
import { VoiceInput } from "@/components/voice-input";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  model: string | null;
  skills: string[];
  enabled: boolean;
  source: string;
};
type RunResult = {
  run_id?: string;
  state?: string;
  output: string;
  stop_reason: string;
  pending_tool: { tool: string; skill: string; arguments: Record<string, unknown> } | null;
  steps: { tool: string; arguments: Record<string, unknown>; result: unknown; error: string | null }[];
};
type LLMSettings = {
  default_agent_model: { value: string; source: string };
};
type AgentPreset = {
  id: string;
  label: string;
  system_prompt: string;
  model: string | null;
  skills: string[];
  enabled: boolean;
  created_at: string;
};

export default function AgentsPage() {
  const qc = useQueryClient();
  const meQ = useQuery<Me>({ queryKey: ["me"], queryFn: () => api<Me>("/v1/auth/me"), retry: false });
  const agentsQ = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/v1/agents"),
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState("core");

  const modelsQ = useQuery<{ ok: boolean; models: { id: string; provider: string; upstream: string }[]; error?: string }>({
    queryKey: ["models"],
    queryFn: () => api("/v1/models"),
    refetchInterval: 30000,
  });
  const llmSettingsQ = useQuery<LLMSettings>({
    queryKey: ["llm-settings"],
    queryFn: () => api<LLMSettings>("/v1/models/settings"),
    retry: false,
  });
  const presetsQ = useQuery<AgentPreset[]>({
    queryKey: ["agent-presets", selected],
    queryFn: () => api<AgentPreset[]>(`/v1/agents/${selected}/presets`),
    enabled: !!selected,
    retry: false,
  });
  const models = modelsQ.data?.models ?? [];
  const featuredModels = useMemo<string[]>(() => {
    const seed = [
      llmSettingsQ.data?.default_agent_model?.value,
      "gemini-2.5-flash",
      "gpt-4o",
      "claude-sonnet",
      "groq-llama-8b",
      "local-ollama",
      ...models.slice(0, 4).map((m) => m.id),
    ].filter(Boolean) as string[];
    return Array.from(new Set(seed));
  }, [llmSettingsQ.data?.default_agent_model?.value, models]);

  const [message, setMessage] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [result, setResult] = useState<RunResult | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrompt, setEditingPrompt] = useState("");
  const [editingModel, setEditingModel] = useState("gemini-2.5-flash");
  const [editingSkills, setEditingSkills] = useState("");
  const [editingEnabled, setEditingEnabled] = useState(true);
  const [presetLabel, setPresetLabel] = useState("baseline");
  const [presetImportText, setPresetImportText] = useState("");
  const [presetImportFile, setPresetImportFile] = useState("");
  const [presetImportOverwrite, setPresetImportOverwrite] = useState(true);
  const [presetImportError, setPresetImportError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createModel, setCreateModel] = useState("gemini-2.5-flash");
  const [createSkills, setCreateSkills] = useState("");

  const isAdmin = meQ.data?.role === "admin";
  const agents = agentsQ.data ?? [];
  const current = agents.find((a) => a.name === selected);
  const sampleAgentBundle = useMemo(() => {
    const base = current ?? {
      name: "sample-agent",
      system_prompt: "You are a focused BuildAgent assistant.",
      model: llmSettingsQ.data?.default_agent_model?.value || "gemini-2.5-flash",
      skills: ["notes"],
      enabled: true,
    };
    return {
      overwrite: true,
      presets: [
        {
          label: "baseline",
          system_prompt: base.system_prompt,
          model: base.model,
          skills: base.skills,
          enabled: base.enabled,
          manifest: { source: "manual" },
        },
        {
          label: "locked-minimal",
          system_prompt: "You are a minimal safe agent. Prefer read-only actions.",
          model: base.model,
          skills: base.skills.slice(0, 1),
          enabled: false,
          manifest: { source: "manual" },
        },
      ],
    };
  }, [current, llmSettingsQ.data?.default_agent_model?.value]);

  useEffect(() => {
    if (!current) return;
    setEditingName(current.name);
    setEditingPrompt(current.system_prompt);
    setEditingModel(current.model || "gemini-2.5-flash");
    setEditingSkills(current.skills.join(", "));
    setEditingEnabled(current.enabled);
    setModel(current.model || llmSettingsQ.data?.default_agent_model?.value || "gemini-2.5-flash");
  }, [current]);

  useEffect(() => {
    if (llmSettingsQ.data?.default_agent_model?.value) {
      setModel(llmSettingsQ.data.default_agent_model.value);
      setCreateModel(llmSettingsQ.data.default_agent_model.value);
    }
  }, [llmSettingsQ.data]);

  const create = useMutation({
    mutationFn: () =>
      api<Agent>("/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          system_prompt: createPrompt,
          model: createModel,
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
          model: editingModel,
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

  const savePreset = useMutation({
    mutationFn: () =>
      api<AgentPreset>(`/v1/agents/${selected}/presets/${encodeURIComponent(presetLabel.trim())}`, {
        method: "PUT",
      }),
    onSuccess: () => presetsQ.refetch(),
  });

  const applyPreset = useMutation({
    mutationFn: (label: string) =>
      api<Agent>(`/v1/agents/${selected}/presets/${encodeURIComponent(label)}/apply`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      presetsQ.refetch();
    },
  });

  const deletePreset = useMutation({
    mutationFn: (label: string) =>
      api<void>(`/v1/agents/${selected}/presets/${encodeURIComponent(label)}`, {
        method: "DELETE",
      }),
    onSuccess: () => presetsQ.refetch(),
  });

  const exportPresets = useMutation({
    mutationFn: async () => {
      const token = getToken();
      const res = await fetch(`${API_URL}/v1/agents/${selected}/presets/export`, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { name: string; presets: AgentPreset[] };
    },
    onSuccess: (bundle) => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-presets-${bundle.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const importPresets = useMutation({
    mutationFn: async () => {
      setPresetImportError(null);
      const parsed = JSON.parse(presetImportText) as { presets?: AgentPreset[]; [key: string]: unknown } | AgentPreset[];
      const bundle = Array.isArray(parsed) ? { presets: parsed } : parsed;
      return api<{ name: string; presets: AgentPreset[] }>(`/v1/agents/${selected}/presets/import`, {
        method: "POST",
        body: JSON.stringify({ ...bundle, overwrite: presetImportOverwrite }),
      });
    },
    onSuccess: () => {
      presetsQ.refetch();
      setPresetImportText("");
      setPresetImportFile("");
    },
    onError: (err) => {
      setPresetImportError(err instanceof Error ? err.message : "import failed");
    },
  });

  const enabledCount = useMemo(() => agents.filter((a) => a.enabled).length, [agents]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Catalog Header Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/40 p-6 md:p-8 backdrop-blur-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.12),transparent_40%)]" />
        <div className="relative z-10">
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Orchestration</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">Live Agent Catalog</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 font-sans">
            Provision database-backed intelligent agents, configure primary system instructions, select models,
            and monitor live multi-step execution traces.
          </p>
        </div>
      </section>

      {/* Metrics Row */}
      <HelpBanner
        title="Agent loop"
        description="Use the roster to pick an agent, tune its prompt and skills, then run a live loop. Presets can be exported, imported, and applied to restore exact configs."
        bullets={[
          "Admin can edit agents and saved presets.",
          "Model dropdowns are live from /v1/models.",
          "Approval stops are normal; resume after decision.",
        ]}
        href="/onboarding"
        hrefLabel="See setup path"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Agents Total" value={agents.length} />
        <Metric label="Active Enabled" value={enabledCount} />
        <Metric label="System Presets" value={agents.filter((a) => a.source === "preset").length} />
        <Metric label="Custom Manual" value={agents.filter((a) => a.source === "manual").length} />
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Model pool" value={models.length} />
        <Metric label="Default agent" value={llmSettingsQ.data?.default_agent_model?.value || "gemini-2.5-flash"} />
        <Metric label="Default runtime" value={model} />
        <Metric label="Quick picks" value={featuredModels.length} />
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Selected agent" value={current?.name || "none"} />
        <Metric label="Selected model" value={current?.model || llmSettingsQ.data?.default_agent_model?.value || "gemini-2.5-flash"} />
        <Metric label="Saved presets" value={String(presetsQ.data?.length ?? 0)} />
        <Metric label="Preset mode" value={current?.source === "preset" ? "locked" : "editable"} />
      </section>

      {/* Create Agent Form (Admin Only) */}
      {isAdmin && (
        <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-white font-sans">Provision Custom Agent</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Create an operational profile with customized system instructions and capability scopes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Agent Identifier (Name)">
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. researcher" />
              </Field>
              <Field label="Granted Skills (comma separated)">
                <Input value={createSkills} onChange={(e) => setCreateSkills(e.target.value)} placeholder="e.g. notes, slack, gmail" />
              </Field>
              <Field label="Preferred Model">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {featuredModels.map((id) => (
                      <Button
                        key={id}
                        type="button"
                        variant={createModel === id ? "default" : "outline"}
                        className="h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-[0.15em]"
                        onClick={() => setCreateModel(id)}
                      >
                        {id}
                      </Button>
                    ))}
                  </div>
                  <Select value={createModel} onChange={(e) => setCreateModel(e.target.value)}>
                    {modelOptions(models).map(([label, ids]) => (
                      <optgroup key={label} label={label} className="bg-[#0b0c10]">
                        {ids.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
              </Field>
              <Field label="Initialization Status">
                <div className="flex h-11 w-full items-center rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 px-3.5 text-sm text-slate-400 font-mono">
                  ACTIVE
                </div>
              </Field>
            </div>
            <Field label="System Prompt / Directives">
              <textarea className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3.5 text-sm text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all font-sans" value={createPrompt} onChange={(e) => setCreatePrompt(e.target.value)} placeholder="You are a research assistant tasked with..." />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !createName.trim() || !createPrompt.trim()}>
                {create.isPending ? "Provisioning..." : "Provision Agent"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Roster Panel Grid */}
      <section className="grid gap-6 lg:grid-cols-[300px,1fr]">
        {/* Roster sidebar list */}
        <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl h-fit">
          <CardHeader className="pb-3 border-b border-white/[0.06] bg-white/[0.01]">
            <CardTitle className="text-sm font-bold text-white font-sans">Active Agent Roster</CardTitle>
            <CardDescription className="text-xs text-slate-500">Pick profile for tuning & execution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 p-3 max-h-[600px] overflow-y-auto">
            {agents.map((a) => (
              <button
                key={a.name}
                onClick={() => setSelected(a.name)}
                className={`w-full rounded-xl p-3 text-left transition-all duration-200 border ${
                  selected === a.name
                    ? "bg-accent/10 border-accent/30 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm">{a.name}</div>
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    a.enabled ? "bg-emerald-400 status-glow-emerald" : "bg-slate-500"
                  }`} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[9px] font-mono font-medium tracking-wide uppercase px-1.5 py-0 border-white/[0.08] text-slate-300">
                    {a.source}
                  </Badge>
                  {a.source === "preset" ? (
                    <Badge variant="outline" className="text-[9px] font-mono font-medium tracking-wide uppercase px-1.5 py-0 border-cyan-500/30 text-cyan-300">
                      locked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-mono font-medium tracking-wide uppercase px-1.5 py-0 border-violet-500/30 text-violet-300">
                      editable
                    </Badge>
                  )}
                  {a.skills.slice(0, 3).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[9px] font-mono font-medium tracking-wide uppercase px-1.5 py-0">
                      {s}
                    </Badge>
                  ))}
                  {a.skills.length > 3 && (
                    <span className="text-[9px] font-mono text-slate-500 px-1 font-semibold">+{a.skills.length - 3}</span>
                  )}
                </div>
                <div className="mt-2 text-[10px] font-mono text-slate-500">
                  model: {a.model || "gemini-2.5-flash"}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Detailed configuration and terminal runtime tracer */}
        <div className="space-y-6">
          <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
            <CardHeader className="pb-4 border-b border-white/[0.06] bg-white/[0.01]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle className="text-base font-bold text-white font-sans">Tuning Profile</CardTitle>
                <div className="flex gap-2">
                  {current && (
                    <>
                      <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider border-white/[0.08]">{current.source}</Badge>
                      <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-wider ${
                        current.enabled
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                          : "border-white/10 bg-white/5 text-slate-400"
                      }`}>{current.enabled ? "Enabled" : "Disabled"}</Badge>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Agent Identifier">
                  <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} disabled={!isAdmin || !current} />
                </Field>
                <Field label="Capability Skills">
                  <Input value={editingSkills} onChange={(e) => setEditingSkills(e.target.value)} disabled={!isAdmin || !current} />
                </Field>
                <Field label="Preferred Model">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {featuredModels.map((id) => (
                        <Button
                          key={id}
                          type="button"
                          variant={editingModel === id ? "default" : "outline"}
                          className="h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-[0.15em]"
                          onClick={() => setEditingModel(id)}
                          disabled={!isAdmin || !current}
                        >
                          {id}
                        </Button>
                      ))}
                    </div>
                    <Select value={editingModel} onChange={(e) => setEditingModel(e.target.value)} disabled={!isAdmin || !current}>
                      {modelOptions(models).map(([label, ids]) => (
                        <optgroup key={label} label={label} className="bg-[#0b0c10]">
                          {ids.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </div>
                </Field>
                <Field label="Operational Status">
                  <Select value={String(editingEnabled)} onChange={(e) => setEditingEnabled(e.target.value === "true")} disabled={!isAdmin || !current}>
                    <option value="true" className="bg-[#0b0c10]">Operational</option>
                    <option value="false" className="bg-[#0b0c10]">Disabled</option>
                  </Select>
                </Field>
              </div>
              <Field label="System Instructions (Tuning Directive)">
                <textarea className="min-h-32 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3.5 text-sm text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all font-sans" value={editingPrompt} onChange={(e) => setEditingPrompt(e.target.value)} disabled={!isAdmin || !current} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => toggle.mutate(!current?.enabled)} disabled={!isAdmin || !current || toggle.isPending}>
                  {current?.enabled ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="outline" onClick={() => update.mutate()} disabled={!isAdmin || !current || update.isPending}>
                  Save changes
                </Button>
                <Button variant="ghost" className="hover:bg-rose-500/10 hover:text-rose-400" onClick={() => remove.mutate()} disabled={!isAdmin || !current || current.source === "preset" || remove.isPending}>
                  Delete agent
                </Button>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Saved Presets</div>
                    <div className="text-xs text-slate-500">Store and restore snapshots for this agent.</div>
                  </div>
                  <div className="flex gap-2">
                    <Input value={presetLabel} onChange={(e) => setPresetLabel(e.target.value)} placeholder="baseline" className="w-40" disabled={!isAdmin || !current} />
                    <Button
                      variant="outline"
                      onClick={() => savePreset.mutate()}
                      disabled={!isAdmin || !current || !presetLabel.trim() || savePreset.isPending}
                    >
                      Save preset
                    </Button>
                  </div>
                </div>
              <div className="grid gap-2 md:grid-cols-2">
                  {(presetsQ.data ?? []).map((preset) => (
                    <div key={preset.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white">{preset.label}</div>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                          {preset.enabled ? "on" : "off"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {preset.model || "gemini-2.5-flash"} · {preset.skills.length} skills
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => applyPreset.mutate(preset.label)} disabled={!isAdmin || applyPreset.isPending}>
                          Apply
                        </Button>
                        <Button size="sm" variant="ghost" className="hover:bg-rose-500/10 hover:text-rose-400" onClick={() => deletePreset.mutate(preset.label)} disabled={!isAdmin || deletePreset.isPending}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(presetsQ.data?.length ?? 0) === 0 && (
                    <div className="rounded-lg border border-dashed border-white/[0.08] p-4 text-sm text-slate-500 md:col-span-2">
                      No presets saved yet.
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">Import / export</div>
                      <div className="text-xs text-slate-500">Download the preset bundle or paste a bundle JSON to restore it.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => setPresetImportText(JSON.stringify(sampleAgentBundle, null, 2))}
                        disabled={!isAdmin || !current}
                      >
                        Load sample bundle
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const bundle = {
                            overwrite: true,
                            presets: (presetsQ.data ?? []).map((preset) => ({
                              label: preset.label,
                              system_prompt: preset.system_prompt,
                              model: preset.model,
                              skills: preset.skills,
                              enabled: preset.enabled,
                              manifest: { source: "manual" },
                            })),
                          };
                          setPresetImportText(JSON.stringify(bundle, null, 2));
                        }}
                        disabled={!isAdmin || !current || (presetsQ.data?.length ?? 0) === 0}
                      >
                        Load current bundle
                      </Button>
                      <Button variant="outline" onClick={() => exportPresets.mutate()} disabled={!isAdmin || !current || exportPresets.isPending}>
                        Export JSON
                      </Button>
                    </div>
                  </div>
                  <textarea
                    className="min-h-32 w-full rounded-lg border border-white/[0.08] bg-[#0c0d12]/50 p-3 text-xs font-mono text-slate-200 outline-none"
                    placeholder='{"presets":[{"label":"baseline","version":"0.1.0","description":"...","permissions":[],"requires_approval":true,"enabled":true,"manifest":{}}]}'
                    value={presetImportText}
                    onChange={(e) => setPresetImportText(e.target.value)}
                    disabled={!isAdmin || !current}
                  />
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-accent-hover"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPresetImportFile(file.name);
                      const reader = new FileReader();
                      reader.onload = () => setPresetImportText(String(reader.result ?? ""));
                      reader.readAsText(file);
                    }}
                    disabled={!isAdmin || !current}
                  />
                  {presetImportFile && <div className="text-[10px] font-mono text-slate-500">file: {presetImportFile}</div>}
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={presetImportOverwrite}
                        onChange={(e) => setPresetImportOverwrite(e.target.checked)}
                        disabled={!isAdmin || !current}
                      />
                      Overwrite existing
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => importPresets.mutate()}
                      disabled={!isAdmin || !current || !presetImportText.trim() || importPresets.isPending}
                    >
                      Import presets
                    </Button>
                    {presetImportError && <span className="text-xs text-rose-400">{presetImportError}</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Interactive prompt runner panel */}
          <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl relative overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/[0.06] bg-white/[0.01]">
              <CardTitle className="text-base font-bold text-white font-sans">Operational Runner console</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Execute a task-prompt against the current database operational profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="relative">
                <textarea
                  className="w-full min-h-[90px] rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3.5 pr-12 text-sm font-mono text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all"
                  placeholder="What should the agent execute? Type or press mic to speak..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div className="absolute right-2 top-2">
                  <VoiceInput
                    onTranscript={(text, isFinal) => {
                      if (isFinal) {
                        setMessage((prev) => (prev ? `${prev.trimEnd()} ${text}` : text));
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">Gateway LLM:</span>
                  <div className="flex flex-wrap gap-2">
                    {featuredModels.map((id) => (
                      <Button
                        key={id}
                        type="button"
                        variant={model === id ? "default" : "outline"}
                        className="h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-[0.15em]"
                        onClick={() => setModel(id)}
                      >
                        {id}
                      </Button>
                    ))}
                  </div>
                  <Select className="w-auto min-w-56 rounded-lg px-2.5 py-1.5 text-xs font-mono" value={model} onChange={(e) => setModel(e.target.value)}>
                    {modelOptions(models).map(([label, ids]) => (
                      <optgroup key={label} label={label} className="bg-[#0b0c10]">
                        {ids.map((id) => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </optgroup>
                    ))}
                    {models.length === 0 && <option value={model}>{model}</option>}
                  </Select>
                  {modelsQ.data && !modelsQ.data.ok && (
                    <span className="text-[9px] font-mono text-amber-400">Gate fail: {modelsQ.data.error}</span>
                  )}
                </div>
                <Button onClick={() => run.mutate()} disabled={!message || run.isPending || !current || !current.enabled}>
                  {run.isPending ? "Executing Loop..." : "Execute Loop"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tracer Log Output */}
          {result && (
            <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl relative overflow-hidden">
              <CardHeader className="pb-3 border-b border-white/[0.06] bg-white/[0.01]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <CardTitle className="text-base font-bold text-white font-sans">Execution Trace Log</CardTitle>
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    <span className="text-slate-500">Stop reason:</span>
                    <span className="text-emerald-400 font-semibold">{result.stop_reason}</span>
                    {result.pending_tool && (
                      <span className="text-amber-400 animate-pulse font-semibold">| Pending: {result.pending_tool.tool}</span>
                    )}
                    {result.run_id && (
                      <a href={`/agent-runs/${result.run_id}`} className="text-accent hover:text-accent-hover font-semibold transition-colors">
                        [Open Details &rarr;]
                      </a>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                {result.output && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Final Output Stream:</span>
                    <pre className="whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-[#040508] p-4 text-xs font-mono text-slate-200 leading-relaxed max-h-40 overflow-y-auto">
                      {result.output}
                    </pre>
                  </div>
                )}

                {/* Traced step loops */}
                <div className="space-y-4">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Trace execution steps:</span>
                  {result.steps.map((s, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0c0d12]/30 p-4 text-xs font-mono relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-accent/10 border-accent/20 text-accent font-mono py-0 px-1.5 text-[9px] font-bold">Step {i + 1}</Badge>
                          <span className="font-bold text-white tracking-wide text-xs">{s.tool}</span>
                        </div>
                        {s.error && <Badge className="bg-rose-500/10 border-rose-500/20 text-rose-400 text-[9px] uppercase tracking-wider font-bold">Error Signal</Badge>}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1 font-sans">Invocation Arguments:</div>
                          <pre className="overflow-x-auto rounded-lg bg-black/40 p-2.5 text-[11px] text-slate-400 font-mono">{JSON.stringify(s.arguments, null, 2)}</pre>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1 font-sans">Operation Result:</div>
                          <pre className={cn(
                            "overflow-x-auto rounded-lg p-2.5 text-[11px] font-mono",
                            s.error ? "bg-rose-500/5 text-rose-400 border border-rose-500/10" : "bg-black/40 text-emerald-400"
                          )}>
                            {JSON.stringify(s.result ?? s.error, null, 2)}
                          </pre>
                        </div>
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

function modelOptions(models: { id: string; provider: string; upstream: string }[]) {
  const grouped = models.reduce<Record<string, string[]>>((acc, m) => {
    (acc[m.provider] ||= []).push(m.id);
    return acc;
  }, {});
  return Object.entries(grouped);
}
