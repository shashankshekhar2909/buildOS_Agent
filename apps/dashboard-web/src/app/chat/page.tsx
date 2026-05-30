"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Send, Trash2, Sparkles, Container, ActivitySquare, Cpu, Bug, Calendar, FileSearch,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpBanner } from "@/components/help-banner";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceInput } from "@/components/voice-input";
import { cn } from "@/lib/utils";

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
  optimistic?: boolean;
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

const SEED_PROMPTS: { label: string; prompt: string; icon: LucideIcon }[] = [
  { label: "Docker check", prompt: "How many docker containers are running?", icon: Container },
  { label: "App health", prompt: "Is this app running fine?", icon: ActivitySquare },
  { label: "Node status", prompt: "List my nodes and their last-seen time.", icon: Cpu },
  { label: "Recent errors", prompt: "Show the last 20 audit log entries with errors.", icon: Bug },
  { label: "Plan tomorrow", prompt: "What's on my calendar for tomorrow?", icon: Calendar },
  { label: "Search notes", prompt: "Search my notes for anything about the agent runner.", icon: FileSearch },
];

export default function ChatPage() {
  const qc = useQueryClient();
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [message, setMessage] = useState("");
  const [agentName, setAgentName] = useState("core");
  const [model, setModel] = useState("");
  const [source, setSource] = useState("app");
  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);

  const messagesQ = useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", agentName, source],
    queryFn: () =>
      api<ChatMessage[]>(
        `/v1/chat/messages?agent_name=${encodeURIComponent(agentName || "core")}&source=${encodeURIComponent(source)}`
      ),
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

  // Combine server messages + optimistic (server is source of truth; drop optimistic
  // pair if the server already has a matching trailing exchange).
  const merged: ChatMessage[] = useMemo(() => {
    const base = messagesQ.data ?? [];
    if (!optimistic.length) return base;
    const lastServer = base[base.length - 1];
    if (lastServer && lastServer.role === "assistant") return base;
    return [...base, ...optimistic];
  }, [messagesQ.data, optimistic]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [merged.length]);

  useEffect(() => {
    if (!agentsQ.data?.length) return;
    if (agentsQ.data.some((item) => item.name === agentName)) return;
    setAgentName(agentsQ.data[0]?.name || "core");
  }, [agentName, agentsQ.data]);

  // Autofocus textarea on mount + on agent change
  useEffect(() => {
    if (source === "app") textareaRef.current?.focus();
  }, [source, agentName]);

  const send = useMutation({
    mutationFn: (text: string) =>
      api<ChatSendOut>("/v1/chat/messages", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          agent_name: agentName || "core",
          model: model || null,
        }),
      }),
    onMutate: (text) => {
      const now = new Date().toISOString();
      setOptimistic([
        {
          id: `optimistic-user-${now}`,
          owner_id: "me",
          role: "user",
          content: text,
          agent_name: agentName,
          model: model || "default",
          source,
          run_id: null,
          created_at: now,
          optimistic: true,
        },
        {
          id: `optimistic-thinking-${now}`,
          owner_id: "agent",
          role: "assistant",
          content: "__typing__",
          agent_name: agentName,
          model: model || "default",
          source,
          run_id: null,
          created_at: now,
          optimistic: true,
        },
      ]);
    },
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["chat-messages", agentName, source] });
    },
    onError: (e: unknown) => {
      toast.error("Send failed", {
        description: e instanceof Error ? e.message.slice(0, 120) : undefined,
      });
    },
    onSettled: () => {
      setOptimistic([]);
    },
  });

  const clear = useMutation({
    mutationFn: () =>
      api<void>(
        `/v1/chat/messages?agent_name=${encodeURIComponent(agentName || "core")}&source=${encodeURIComponent(source)}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-messages", agentName, source] });
      toast.success("Chat cleared");
    },
  });

  const onSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || send.isPending || source !== "app") return;
    try {
      await send.mutateAsync(trimmed);
    } catch {
      /* error toast already shown */
    }
  };

  const empty = (messagesQ.data?.length ?? 0) === 0 && optimistic.length === 0;

  return (
    <div className="space-y-6">
      <div className="max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Chat</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">App chatbot</h1>
        <p className="mt-2 text-sm text-muted">
          Talk here. It can pick tools, run skills, and answer without WhatsApp.
        </p>
      </div>

      <HelpBanner
        title="Chat mode"
        description="Use this when you want the app to behave like a WhatsApp-style assistant, but inside the dashboard."
        bullets={[
          "Pick an agent or stay on core.",
          "Pick a model or use the default.",
          "Read-only tools auto-pass, writes still gate on approvals.",
          "Press Enter to send, Shift+Enter for newline.",
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
            </div>
            {source === "whatsapp" && (
              <p className="text-xs text-muted">
                WhatsApp view is read-only here. Incoming and outgoing WhatsApp turns land in the same transcript.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => clear.mutate()}
                disabled={clear.isPending || !(messagesQ.data?.length ?? 0)}
              >
                <Trash2 size={14} className="mr-1.5" />
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
              <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1 scroll-smooth">
                {/* Initial load */}
                {messagesQ.isLoading && (
                  <div className="space-y-3">
                    <MessageSkeleton align="left" />
                    <MessageSkeleton align="right" />
                    <MessageSkeleton align="left" />
                  </div>
                )}

                {/* Empty + seed prompts */}
                {!messagesQ.isLoading && empty && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                      <Sparkles className="mx-auto mb-2 text-accent" size={20} />
                      <p className="text-sm font-medium text-white">Ask anything.</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Pick a starter or type your own. Enter to send.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SEED_PROMPTS.map((seed) => {
                        const Icon = seed.icon;
                        return (
                          <button
                            key={seed.label}
                            type="button"
                            disabled={source !== "app"}
                            onClick={() => {
                              setMessage(seed.prompt);
                              textareaRef.current?.focus();
                            }}
                            className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-all hover:border-accent/30 hover:bg-accent/[0.04] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-1.5 text-slate-400 group-hover:text-accent transition-colors">
                              <Icon size={14} />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-semibold text-slate-200">{seed.label}</span>
                              <span className="block text-[11px] text-slate-500 line-clamp-2">{seed.prompt}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {merged.map((item) => (
                  <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl border px-4 py-3 text-sm leading-6 transition-opacity",
                        item.role === "user"
                          ? "border-accent/25 bg-accent/10 text-white"
                          : "border-white/10 bg-white/[0.04] text-slate-100",
                        item.optimistic && "opacity-80"
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-muted">
                        <span>{item.role}</span>
                        <span>·</span>
                        <span>{item.agent_name}</span>
                        <span>·</span>
                        <span>{item.source}</span>
                        {!item.optimistic && (
                          <>
                            <span>·</span>
                            <span>{new Date(item.created_at).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                      {item.content === "__typing__" ? (
                        <TypingDots />
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans">{item.content}</pre>
                      )}
                    </div>
                  </div>
                ))}

                <div ref={endRef} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardContent className="space-y-3 pt-6">
              <label className="flex flex-col gap-2 text-xs text-muted">
                <div className="flex items-center justify-between">
                  <span>Message</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    Enter to send · Shift+Enter for newline
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    className="min-h-28 w-full rounded-2xl border border-white/[0.08] bg-[#0c0d12]/50 px-4 py-3 pr-12 text-sm text-slate-100 outline-none transition-all duration-200 focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30 resize-y disabled:opacity-60"
                    value={message}
                    disabled={source !== "app"}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void onSubmit();
                      }
                    }}
                    placeholder={
                      source === "app"
                        ? "Ask it to build, inspect, stop, search, or check systems… (Enter to send)"
                        : "WhatsApp view is read-only here."
                    }
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
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void onSubmit()}
                  disabled={send.isPending || !message.trim() || source !== "app"}
                  className="gap-1.5"
                >
                  {send.isPending ? (
                    <>
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Send
                    </>
                  )}
                </Button>
                {send.isPending && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <TypingDots compact />
                    <span>{agentName} is thinking</span>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TypingDots({ compact = false }: { compact?: boolean }) {
  const size = compact ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("rounded-full bg-slate-400 animate-bounce", size)} style={{ animationDelay: "0ms" }} />
      <span className={cn("rounded-full bg-slate-400 animate-bounce", size)} style={{ animationDelay: "150ms" }} />
      <span className={cn("rounded-full bg-slate-400 animate-bounce", size)} style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function MessageSkeleton({ align }: { align: "left" | "right" }) {
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[60%] space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
    </div>
  );
}
