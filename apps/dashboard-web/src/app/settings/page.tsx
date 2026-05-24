"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api, API_URL, WS_URL } from "@/lib/api";
import { useSession } from "@/lib/session";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Health = { ok?: boolean; ready?: boolean };
type ProviderInfo = {
  id: string;
  label: string;
  configured: boolean;
  source: string;
  env: string | null;
};
type LLMSettings = {
  litellm_master_key: { configured: boolean; source: string };
  gemini_api_key: { configured: boolean; source: string };
  gemini_model: { value: string; source: string };
  default_chat_model: { value: string; source: string };
  default_embedding_model: { value: string; source: string };
  default_agent_model: { value: string; source: string };
};
type ModelItem = { id: string; provider: string; upstream: string };

export default function SettingsPage() {
  const session = useSession();
  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });

  const healthQ = useQuery<Health>({
    queryKey: ["healthz"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/healthz`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    retry: false,
  });

  const readyQ = useQuery<Health>({
    queryKey: ["readyz"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/readyz`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    retry: false,
  });

  const providersQ = useQuery<ProviderInfo[]>({
    queryKey: ["providers"],
    queryFn: () => api<ProviderInfo[]>("/v1/models/providers"),
    retry: false,
  });
  const providersMeQ = useQuery<ProviderInfo[]>({
    queryKey: ["providers-me"],
    queryFn: () => api<ProviderInfo[]>("/v1/models/providers/me"),
    retry: false,
  });
  const modelsQ = useQuery<{ ok: boolean; models: ModelItem[]; error?: string }>({
    queryKey: ["models"],
    queryFn: () => api("/v1/models"),
    retry: false,
  });
  const llmSettingsQ = useQuery<LLMSettings>({
    queryKey: ["llm-settings"],
    queryFn: () => api<LLMSettings>("/v1/models/settings"),
    retry: false,
  });

  const [providerDrafts, setProviderDrafts] = useState<Record<string, string>>({});
  const [llmMasterKey, setLlmMasterKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [defaultChatModel, setDefaultChatModel] = useState("gemini-2.5-flash");
  const [defaultEmbeddingModel, setDefaultEmbeddingModel] = useState("embed-small");
  const [defaultAgentModel, setDefaultAgentModel] = useState("gemini-2.5-flash");

  useEffect(() => {
    if (!llmSettingsQ.data) return;
    setGeminiModel(llmSettingsQ.data.gemini_model.value || "gemini-2.5-flash");
    setDefaultChatModel(llmSettingsQ.data.default_chat_model.value || "gemini-2.5-flash");
    setDefaultEmbeddingModel(llmSettingsQ.data.default_embedding_model.value || "embed-small");
    setDefaultAgentModel(llmSettingsQ.data.default_agent_model.value || "gemini-2.5-flash");
  }, [llmSettingsQ.data]);

  const saveProvider = useMutation({
    mutationFn: ({ provider, scope }: { provider: string; scope: "global" | "user" }) =>
      api<{ ok: boolean; provider: string }>(`/v1/models/providers/${scope === "global" ? "" : "me/"}${provider}`, {
        method: "PUT",
        body: JSON.stringify({ api_key: providerDrafts[`${scope}:${provider}`] || "" }),
      }),
    onSuccess: (_, vars) => {
      setProviderDrafts((prev) => ({ ...prev, [`${vars.scope}:${vars.provider}`]: "" }));
      providersQ.refetch();
      providersMeQ.refetch();
    },
  });

  const clearProvider = useMutation({
    mutationFn: ({ provider, scope }: { provider: string; scope: "global" | "user" }) =>
      api<{ ok: boolean; provider: string }>(`/v1/models/providers/${scope === "global" ? "" : "me/"}${provider}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      providersQ.refetch();
      providersMeQ.refetch();
    },
  });

  const saveLlmSettings = useMutation({
    mutationFn: () =>
      api<LLMSettings>("/v1/models/settings", {
        method: "PUT",
        body: JSON.stringify({
          litellm_master_key: llmMasterKey,
          gemini_api_key: geminiApiKey,
          gemini_model: geminiModel,
          default_chat_model: defaultChatModel,
          default_embedding_model: defaultEmbeddingModel,
          default_agent_model: defaultAgentModel,
        }),
      }),
    onSuccess: (data) => {
      setLlmMasterKey("");
      setGeminiApiKey("");
      setGeminiModel(data.gemini_model.value);
      setDefaultChatModel(data.default_chat_model.value);
      setDefaultEmbeddingModel(data.default_embedding_model.value);
      setDefaultAgentModel(data.default_agent_model.value);
      llmSettingsQ.refetch();
    },
  });

  const claims = session.claims;
  const expiresAt = claims?.exp ? new Date(claims.exp * 1000) : null;
  const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;
  const models = modelsQ.data?.models ?? [];
  const modelGroups = models.reduce<Record<string, string[]>>((acc, m) => {
    (acc[m.provider] ||= []).push(m.id);
    return acc;
  }, {});
  const featuredModels = useMemo<string[]>(() => {
    const seed = [
      llmSettingsQ.data?.default_agent_model?.value,
      llmSettingsQ.data?.default_chat_model?.value,
      llmSettingsQ.data?.gemini_model?.value,
      "gemini-2.5-flash",
      "gpt-4o",
      "claude-sonnet",
      "groq-llama-8b",
      "local-ollama",
      ...models.slice(0, 6).map((m) => m.id),
    ].filter(Boolean) as string[];
    return Array.from(new Set(seed));
  }, [
    llmSettingsQ.data?.default_agent_model?.value,
    llmSettingsQ.data?.default_chat_model?.value,
    llmSettingsQ.data?.gemini_model?.value,
    models,
  ]);
  const globalProviders = providersQ.data ?? [];
  const userProviders = providersMeQ.data ?? [];
  const canEditLlm = meQ.data?.role === "admin";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Account and runtime state</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          This page exposes the current session and a quick check of the running API and websocket endpoints.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="API" value={statusText(healthQ.isLoading, healthQ.isError, healthQ.data?.ok ? "ok" : "down")} />
        <Metric label="Ready" value={statusText(readyQ.isLoading, readyQ.isError, readyQ.data?.ready ? "ready" : "cold")} />
        <Metric label="WS endpoint" value={WS_URL} compact />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Current session">
          {meQ.data ? (
            <div className="divide-y divide-border">
              <Row label="User" value={meQ.data.email} />
              <Row label="Role" value={meQ.data.role} />
              <Row label="Active" value={String(meQ.data.is_active)} />
              <Row label="User ID" value={meQ.data.id} mono />
              <Row label="Access token" value={minutesLeft === null ? "unknown" : `${minutesLeft} min left`} />
              <Row label="Refresh token" value={session.refreshToken ? "present" : "missing"} />
              {expiresAt && <Row label="Expires at" value={expiresAt.toLocaleString()} mono />}
            </div>
        ) : (
          <Empty message="Not signed in. Use /login to create or refresh a session." />
        )}
        </Panel>

        <Panel title="Environment">
          <div className="divide-y divide-border">
            <Row label="API URL" value={API_URL} mono />
            <Row label="Websocket URL" value={WS_URL} mono />
            <Row label="Auth" value="JWT access + refresh" />
            <Row label="CORS" value="browser host on :3300" />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Model pool" value={String(models.length)} />
        <Metric label="Default chat" value={llmSettingsQ.data?.default_chat_model.value || "gemini-2.5-flash"} />
        <Metric label="Default agent" value={llmSettingsQ.data?.default_agent_model.value || "gemini-2.5-flash"} />
        <Metric label="Gemini route" value={llmSettingsQ.data?.gemini_model.value || "gemini-2.5-flash"} />
      </section>

      <section className="rounded-2xl border border-border bg-panel overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-white">Routing summary</div>
        <div className="grid gap-4 p-4 md:grid-cols-4">
          <Metric label="Shared providers" value={String(globalProviders.length)} />
          <Metric label="Personal overrides" value={String(userProviders.length)} />
          <Metric label="Chat source" value={llmSettingsQ.data?.default_chat_model.source || "env"} />
          <Metric label="Agent source" value={llmSettingsQ.data?.default_agent_model.source || "env"} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Global provider keys">
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted">
              Admin only. These keys back the shared model gateway and are used when no user override exists.
            </p>
            {globalProviders.map((provider) => (
              <ProviderRow
                key={`global-${provider.id}`}
                provider={provider}
                scope="global"
                draft={providerDrafts[`global:${provider.id}`] ?? ""}
                onDraft={(value) => setProviderDrafts((prev) => ({ ...prev, [`global:${provider.id}`]: value }))}
                onSave={() => saveProvider.mutate({ provider: provider.id, scope: "global" })}
                onClear={() => clearProvider.mutate({ provider: provider.id, scope: "global" })}
                canEdit={meQ.data?.role === "admin"}
              />
            ))}
          </div>
        </Panel>

        <Panel title="My overrides">
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted">
              Personal keys. Useful for multi-user setups. Your overrides stay scoped to your account.
            </p>
            {userProviders.map((provider) => (
              <ProviderRow
                key={`user-${provider.id}`}
                provider={provider}
                scope="user"
                draft={providerDrafts[`user:${provider.id}`] ?? ""}
                onDraft={(value) => setProviderDrafts((prev) => ({ ...prev, [`user:${provider.id}`]: value }))}
                onSave={() => saveProvider.mutate({ provider: provider.id, scope: "user" })}
                onClear={() => clearProvider.mutate({ provider: provider.id, scope: "user" })}
                canEdit={true}
              />
            ))}
          </div>
        </Panel>
      </section>

      <section className="rounded-2xl border border-border bg-panel overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-white">LLM settings</div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted">
            Route the runtime with live model presets. Pick OpenAI, Claude, Gemini, Groq, or local LiteLLM models.
          </p>
          {!canEditLlm && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
              Admin only. View is live, edits are locked until you sign in as an admin.
            </div>
          )}
          {modelsQ.data && !modelsQ.data.ok && <p className="text-xs text-amber-400">Model list failed: {modelsQ.data.error}</p>}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Live models</div>
              <div className="mt-2 text-2xl font-semibold text-white">{models.length}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted">OpenAI/Claude</div>
              <div className="mt-2 text-2xl font-semibold text-white">{models.filter((m) => m.provider === "openai" || m.provider === "anthropic").length}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Gemini/Groq</div>
              <div className="mt-2 text-2xl font-semibold text-white">{models.filter((m) => m.provider === "gemini" || m.provider === "groq").length}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted">LiteLLM/local</div>
              <div className="mt-2 text-2xl font-semibold text-white">{models.filter((m) => m.provider === "ollama" || m.provider === "other").length}</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Gemini API key">
                <Input
                  type="password"
                  placeholder={llmSettingsQ.data?.gemini_api_key.configured ? `Stored via ${llmSettingsQ.data.gemini_api_key.source}` : "AIza..."}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  disabled={!canEditLlm}
                />
              </Field>
            <Field label="Gemini model">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                      {featuredModels.map((id) => (
                        <Button
                          key={id}
                          type="button"
                          variant={geminiModel === id ? "default" : "outline"}
                          className="h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-[0.15em]"
                          onClick={() => setGeminiModel(id)}
                          disabled={!canEditLlm}
                        >
                          {id}
                        </Button>
                      ))}
                    </div>
                <Select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} disabled={!canEditLlm}>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  {Object.entries(modelGroups).map(([provider, ids]) => (
                    <optgroup key={provider} label={provider}>
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
            <Field label="LiteLLM master key">
                <Input
                  type="password"
                  placeholder={llmSettingsQ.data?.litellm_master_key.configured ? `Stored via ${llmSettingsQ.data.litellm_master_key.source}` : "sk-..."}
                  value={llmMasterKey}
                  onChange={(e) => setLlmMasterKey(e.target.value)}
                  disabled={!canEditLlm}
                />
              </Field>
            <Field label="Default chat model">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                      {featuredModels.map((id) => (
                        <Button
                          key={id}
                          type="button"
                          variant={defaultChatModel === id ? "default" : "outline"}
                          className="h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-[0.15em]"
                          onClick={() => setDefaultChatModel(id)}
                          disabled={!canEditLlm}
                        >
                          {id}
                        </Button>
                      ))}
                    </div>
                <Select value={defaultChatModel} onChange={(e) => setDefaultChatModel(e.target.value)} disabled={!canEditLlm}>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="claude-sonnet">claude-sonnet</option>
                  <option value="groq-llama-8b">groq-llama-8b</option>
                  <option value="local-ollama">local-ollama</option>
                  {Object.entries(modelGroups).map(([provider, ids]) => (
                    <optgroup key={provider} label={provider}>
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
            <Field label="Default embedding model">
              <Select value={defaultEmbeddingModel} onChange={(e) => setDefaultEmbeddingModel(e.target.value)} disabled={!canEditLlm}>
                <option value="embed-small">embed-small</option>
                <option value="embed-large">embed-large</option>
                <option value="embed-gemini">embed-gemini</option>
                <option value="embed-openai">embed-openai</option>
              </Select>
            </Field>
            <Field label="Default agent model">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                      {featuredModels.map((id) => (
                        <Button
                          key={id}
                          type="button"
                          variant={defaultAgentModel === id ? "default" : "outline"}
                          className="h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-[0.15em]"
                          onClick={() => setDefaultAgentModel(id)}
                          disabled={!canEditLlm}
                        >
                          {id}
                        </Button>
                      ))}
                    </div>
                <Select value={defaultAgentModel} onChange={(e) => setDefaultAgentModel(e.target.value)} disabled={!canEditLlm}>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="claude-sonnet">claude-sonnet</option>
                  <option value="groq-llama-8b">groq-llama-8b</option>
                  <option value="local-ollama">local-ollama</option>
                  {Object.entries(modelGroups).map(([provider, ids]) => (
                    <optgroup key={provider} label={provider}>
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => saveLlmSettings.mutate()}
              disabled={!canEditLlm || saveLlmSettings.isPending}
            >
              Save LLM settings
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setLlmMasterKey("");
                setGeminiApiKey("");
                setGeminiModel("gemini-2.5-flash");
                setDefaultChatModel("gemini-2.5-flash");
                setDefaultEmbeddingModel("embed-small");
                setDefaultAgentModel("gemini-2.5-flash");
              }}
            >
              Reset draft
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProviderRow({
  provider,
  scope,
  draft,
  onDraft,
  onSave,
  onClear,
  canEdit,
}: {
  provider: ProviderInfo;
  scope: "global" | "user";
  draft: string;
  onDraft: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-bg/40 p-4 md:grid-cols-[180px_1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-white">{provider.label}</div>
          <Badge
            variant="outline"
            className={scope === "global" ? "border-cyan-500/30 text-cyan-300" : "border-violet-500/30 text-violet-300"}
          >
            {scope === "global" ? "shared" : "mine"}
          </Badge>
        </div>
        <div className="text-xs text-muted">
          {provider.id} · {scope === "global" ? "admin-managed" : "user-managed"}
        </div>
      </div>
      <div className="space-y-2">
        <Input
          type="password"
          placeholder={provider.configured ? `Stored via ${provider.source}` : "API key"}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          disabled={!canEdit}
        />
        <div className="text-xs text-muted">
          {provider.configured ? `Configured from ${provider.source}` : "Not configured"}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button
          variant="outline"
          onClick={onSave}
          disabled={!canEdit || !draft.trim()}
        >
          {scope === "global" ? "Save shared" : "Save personal"}
        </Button>
        <Button
          variant="ghost"
          onClick={onClear}
          disabled={!canEdit || provider.source === "none"}
        >
          {scope === "global" ? "Clear shared" : "Clear personal"}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`mt-2 font-semibold text-white ${compact ? "break-all text-sm" : "text-2xl"}`}>{value}</div>
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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`text-white ${mono ? "font-mono text-xs break-all text-right" : "text-right"}`}>{value}</span>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="px-4 py-6 text-sm text-muted">{message}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function statusText(loading: boolean, error: boolean, value: string) {
  if (loading) return "loading";
  if (error) return "down";
  return value;
}
