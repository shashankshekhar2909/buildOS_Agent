"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpBanner } from "@/components/help-banner";
import { Select } from "@/components/ui/select";

type ChatMessage = {
  id: string;
  owner_id: string;
  role: string;
  content: string;
  agent_name: string;
  model: string;
  source: string;
  run_id: string | null;
  created_at: string;
};

type ChatSendOut = {
  state: string;
  output: string | null;
  pending_tool: { [key: string]: unknown } | null;
  steps: Array<{ [key: string]: unknown }>;
  user_message: ChatMessage | null;
  assistant_message: ChatMessage | null;
};

type Agent = {
  name: string;
  model: string | null;
  skills: string[];
  enabled: boolean;
  source: string;
  system_prompt: string;
};

type ModelItem = {
  id: string;
  provider: string;
  upstream: string;
};

export default function ChatPage() {
  const qc = useQueryClient();
  const endRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [agentName, setAgentName] = useState("core");
  const [model, setModel] = useState("");
  const [source, setSource] = useState("app");

  const messagesQ = useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", agentName, source],
    queryFn: () => api<ChatMessage[]>(`/v1/chat/messages?agent_name=${encodeURIComponent(agentName || "core")}&source=${encodeURIComponent(source)}`),
    retry: false,
  });

  const agentsQ = useQuery<Agent[]>({
    queryKey: ["chat-agents"],
    queryFn: () => api<Agent[]>("/v1/agents"),
    retry: false,
  });

  const modelsQ = useQuery<{ ok: boolean; models: ModelItem[] }>({
    queryKey: ["chat-models"],
    queryFn: () => api<{ ok: boolean; models: ModelItem[] }>("/v1/models"),
    retry: false,
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQ.data?.length]);

  useEffect(() => {
    if (!agentsQ.data?.length) return;
    if (agentsQ.data.some((item) => item.name === agentName)) return;
    setAgentName(agentsQ.data[0]?.name || "core");
  }, [agentName, agentsQ.data]);

  const send = useMutation({
    mutationFn: () =>
      api<ChatSendOut>("/v1/chat/messages", {
        method: "POST",
        body: JSON.stringify({
          message: message.trim(),
          agent_name: agentName || "core",
          model: model || null,
        }),
      }),
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["chat-messages", agentName, source] });
    },
  });

  const clear = useMutation({
    mutationFn: () =>
      api<void>(
        `/v1/chat/messages?agent_name=${encodeURIComponent(agentName || "core")}&source=${encodeURIComponent(source)}`,
        { method: "DELETE" }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-messages", agentName, source] }),
  });

  const onSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || send.isPending || source !== "app") return;
    try {
      await send.mutateAsync();
    } catch {
      // leave the failed turn in chat history; user can retry
    }
  };

  return (
    <div className="space-y-6">
      <div className="max-w-4xl">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Chat</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">App chatbot</h1>
        <p className="mt-2 text-sm text-muted">Talk here. It can pick tools, run skills, and answer without WhatsApp.</p>
      </div>

      <HelpBanner
        title="Chat mode"
        description="Use this when you want the app to behave like a WhatsApp-style assistant, but inside the dashboard."
        bullets={[
          "Pick an agent or stay on core.",
          "Pick a model or use the default.",
          "Read-only tools auto-pass, writes still gate on approvals.",
        ]}
        href="/messages"
        hrefLabel="Open connectors"
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Run settings</CardTitle>
            <CardDescription>Choose the brain before sending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Source
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="app">app</option>
                <option value="whatsapp">whatsapp</option>
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Agent
              <Select value={agentName} onChange={(e) => setAgentName(e.target.value)}>
                <option value="core">core</option>
                {agentsQ.data?.map((agent) => (
                  <option key={agent.name} value={agent.name}>
                    {agent.name} {agent.enabled ? "" : "(disabled)"}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Model
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Default model</option>
                {modelsQ.data?.models?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} {item.provider ? `(${item.provider})` : ""}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{source}</Badge>
              <Badge variant="secondary">tools on</Badge>
              <Badge variant="secondary">history on</Badge>
              <Badge variant="secondary">whatsapp off</Badge>
            </div>
            {source === "whatsapp" && (
              <p className="text-xs text-muted">
                WhatsApp view is read-only here. Incoming and outgoing WhatsApp turns land in the same transcript.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => clear.mutate()} disabled={clear.isPending || !(messagesQ.data?.length ?? 0)}>
                Clear chat
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-white">Conversation</CardTitle>
                  <CardDescription>Same agent brain. Clean in-app transcript.</CardDescription>
                </div>
                <Badge variant="secondary">{messagesQ.data?.length ?? 0} msgs</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
                {(messagesQ.data ?? []).length ? (
                  messagesQ.data!.map((item) => (
                    <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
                          item.role === "user"
                            ? "border-accent/25 bg-accent/10 text-white"
                            : "border-white/10 bg-white/[0.04] text-slate-100"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted">
                          <span>{item.role}</span>
                          <span>·</span>
                          <span>{item.agent_name}</span>
                          <span>·</span>
                          <span>{item.source}</span>
                          <span>·</span>
                          <span>{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans">{item.content}</pre>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-sm text-muted">
                    No chat yet. Ask something like: <span className="text-white">how many docker containers are running?</span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardContent className="space-y-3 pt-6">
              <label className="flex flex-col gap-2 text-xs text-muted">
                Message
                <textarea
                  className="min-h-32 w-full rounded-2xl border border-white/[0.08] bg-[#0c0d12]/50 px-4 py-3 text-sm text-slate-100 outline-none transition-all duration-200 focus-visible:border-accent/40 focus-visible:ring-1 focus-visible:ring-accent/30"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSubmit();
                    }
                  }}
                  placeholder="Ask it to build, inspect, stop, search, or check systems..."
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void onSubmit()} disabled={send.isPending || !message.trim() || source !== "app"}>
                  Send
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setMessage("How many docker containers are running?")}
                  disabled={send.isPending}
                >
                  Docker count
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setMessage("Is this app running?")}
                  disabled={send.isPending}
                >
                  Check app
                </Button>
                {send.isPending && <Badge variant="secondary">thinking</Badge>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
