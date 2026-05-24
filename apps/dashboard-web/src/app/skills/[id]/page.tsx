"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, api, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Skill = {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  requires_approval: boolean;
  enabled: boolean;
  manifest: Record<string, unknown>;
};
type SkillPreset = Skill & { label: string };

type Task = {
  id: string;
  title: string;
  kind: string;
  payload: Record<string, unknown>;
  state: string;
  node_id: string | null;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
};

type Node = {
  id: string;
  name: string;
  ssh_host: string | null;
  ssh_user: string | null;
  ssh_port: number | null;
  ssh_auth_type: string | null;
  ssh_configured: boolean;
};

type GmailConfig = {
  refresh_token: string;
  client_id: string;
  client_secret: string;
};

type CalendarConfig = {
  refresh_token: string;
  client_id: string;
  client_secret: string;
};

type WhatsAppConfig = {
  access_token: string;
  phone_number_id: string;
  version: string;
};

type TelegramConnector = {
  registered: boolean;
  bot_name: string | null;
  bot_username: string | null;
  default_chat_id: string | null;
};

type SlackConnector = {
  registered: boolean;
  team: string | null;
  user: string | null;
  default_channel_id: string | null;
};

const GMAIL_KEY = "buildagent.gmail";
const CALENDAR_KEY = "buildagent.calendar";
const WHATSAPP_KEY = "buildagent.whatsapp";

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const [payloadText, setPayloadText] = useState("{\n  \"op\": \"list\"\n}");
  const [runTask, setRunTask] = useState<Task | null>(null);
  const [gmailOp, setGmailOp] = useState<"profile" | "list" | "read" | "search">("list");
  const [gmailQuery, setGmailQuery] = useState("");
  const [gmailMessageId, setGmailMessageId] = useState("");
  const [gmailMaxResults, setGmailMaxResults] = useState("10");
  const [gmailConfig, setGmailConfig] = useState<GmailConfig>({
    refresh_token: "",
    client_id: "",
    client_secret: "",
  });
  const [calendarOp, setCalendarOp] = useState<"list" | "get">("list");
  const [calendarId, setCalendarId] = useState("primary");
  const [calendarEventId, setCalendarEventId] = useState("");
  const [calendarQuery, setCalendarQuery] = useState("");
  const [calendarTimeMin, setCalendarTimeMin] = useState("");
  const [calendarTimeMax, setCalendarTimeMax] = useState("");
  const [calendarMaxResults, setCalendarMaxResults] = useState("10");
  const [calendarConfig, setCalendarConfig] = useState<CalendarConfig>({
    refresh_token: "",
    client_id: "",
    client_secret: "",
  });
  const [waMessage, setWaMessage] = useState("Hello from BuildAgent");
  const [waRecipient, setWaRecipient] = useState("");
  const [waConfig, setWaConfig] = useState<WhatsAppConfig>({
    access_token: "",
    phone_number_id: "",
    version: "v20.0",
  });
  const [telegramOp, setTelegramOp] = useState<"me" | "send_text" | "get_updates">("send_text");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramDefaultChatId, setTelegramDefaultChatId] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("Hello from BuildAgent");
  const [telegramOffset, setTelegramOffset] = useState("");
  const [telegramLimit, setTelegramLimit] = useState("20");
  const [slackOp, setSlackOp] = useState<"me" | "send_text" | "history">("send_text");
  const [slackToken, setSlackToken] = useState("");
  const [slackDefaultChannelId, setSlackDefaultChannelId] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [slackMessage, setSlackMessage] = useState("Hello from BuildAgent");
  const [slackLimit, setSlackLimit] = useState("20");
  const [slackCursor, setSlackCursor] = useState("");
  const [sshNodeId, setSshNodeId] = useState("");
  const [sshCommand, setSshCommand] = useState("hostname");
  const [sshTimeout, setSshTimeout] = useState("60");
  const [sshPty, setSshPty] = useState(false);

  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });

  const skillQ = useQuery<Skill>({
    queryKey: ["skill", id],
    queryFn: () => api<Skill>(`/v1/skills/${id}`),
    retry: false,
  });
  const presetsQ = useQuery<SkillPreset[]>({
    queryKey: ["skill-presets", id],
    queryFn: () => api<SkillPreset[]>(`/v1/skills/${id}/presets`),
    enabled: Boolean(skillQ.data?.id),
    retry: false,
  });
  const [presetLabel, setPresetLabel] = useState("baseline");
  const [presetImportText, setPresetImportText] = useState("");
  const [presetImportFile, setPresetImportFile] = useState("");
  const [presetImportOverwrite, setPresetImportOverwrite] = useState(true);
  const [presetImportError, setPresetImportError] = useState<string | null>(null);

  const nodesQ = useQuery<Node[]>({
    queryKey: ["nodes"],
    queryFn: () => api<Node[]>("/v1/nodes"),
    enabled: skillQ.data?.name === "ssh",
    retry: false,
  });

  const telegramQ = useQuery<TelegramConnector>({
    queryKey: ["telegram-connector", meQ.data?.id ?? "anon"],
    queryFn: () => api<TelegramConnector>("/v1/connectors/telegram"),
    enabled: skillQ.data?.name === "telegram" && Boolean(meQ.data?.id),
    retry: false,
  });

  const slackQ = useQuery<SlackConnector>({
    queryKey: ["slack-connector", meQ.data?.id ?? "anon"],
    queryFn: () => api<SlackConnector>("/v1/connectors/slack"),
    enabled: skillQ.data?.name === "slack" && Boolean(meQ.data?.id),
    retry: false,
  });

  const toggleSkill = useMutation({
    mutationFn: (enabled: boolean) =>
      api<Skill>(`/v1/skills/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const deleteSkill = useMutation({
    mutationFn: () => api<void>(`/v1/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      router.push("/skills");
    },
  });

  const savePreset = useMutation({
    mutationFn: () =>
      api<SkillPreset>(`/v1/skills/${id}/presets/${encodeURIComponent(presetLabel.trim())}`, {
        method: "PUT",
        body: JSON.stringify({
          label: presetLabel.trim(),
          name: skill?.name || "",
          version: skill?.version || "0.1.0",
          description: skill?.description || "",
          permissions: skill?.permissions || [],
          requires_approval: skill?.requires_approval ?? true,
          enabled: skill?.enabled ?? true,
          manifest: skill?.manifest || {},
        }),
      }),
    onSuccess: () => presetsQ.refetch(),
  });

  const applyPreset = useMutation({
    mutationFn: (label: string) => api<Skill>(`/v1/skills/${id}/presets/${encodeURIComponent(label)}/apply`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
      presetsQ.refetch();
    },
  });

  const deletePreset = useMutation({
    mutationFn: (label: string) => api<void>(`/v1/skills/${id}/presets/${encodeURIComponent(label)}`, { method: "DELETE" }),
    onSuccess: () => presetsQ.refetch(),
  });

  const exportPresets = useMutation({
    mutationFn: async () => {
      const token = getToken();
      const res = await fetch(`${API_URL}/v1/skills/${id}/presets/export`, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { name: string; presets: SkillPreset[] };
    },
    onSuccess: (bundle) => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skill-presets-${bundle.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const importPresets = useMutation({
    mutationFn: async () => {
      setPresetImportError(null);
      const parsed = JSON.parse(presetImportText) as { presets?: SkillPreset[]; [key: string]: unknown } | SkillPreset[];
      const bundle = Array.isArray(parsed) ? { presets: parsed } : parsed;
      return api<{ name: string; presets: SkillPreset[] }>(`/v1/skills/${id}/presets/import`, {
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

  const saveTelegram = useMutation({
    mutationFn: () =>
      api<TelegramConnector>("/v1/connectors/telegram", {
        method: "PUT",
        body: JSON.stringify({
          bot_token: telegramToken,
          default_chat_id: telegramDefaultChatId || null,
        }),
      }),
    onSuccess: () => {
      setTelegramToken("");
      qc.invalidateQueries({ queryKey: ["telegram-connector", meQ.data?.id ?? "anon"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
    },
  });

  const deleteTelegram = useMutation({
    mutationFn: () => api<void>("/v1/connectors/telegram", { method: "DELETE" }),
    onSuccess: () => {
      setTelegramToken("");
      setTelegramDefaultChatId("");
      setTelegramChatId("");
      setTelegramMessage("Hello from BuildAgent");
      setTelegramOffset("");
      qc.invalidateQueries({ queryKey: ["telegram-connector", meQ.data?.id ?? "anon"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
    },
  });

  const saveSlack = useMutation({
    mutationFn: () =>
      api<SlackConnector>("/v1/connectors/slack", {
        method: "PUT",
        body: JSON.stringify({
          bot_token: slackToken,
          default_channel_id: slackDefaultChannelId || null,
        }),
      }),
    onSuccess: () => {
      setSlackToken("");
      qc.invalidateQueries({ queryKey: ["slack-connector", meQ.data?.id ?? "anon"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
    },
  });

  const deleteSlack = useMutation({
    mutationFn: () => api<void>("/v1/connectors/slack", { method: "DELETE" }),
    onSuccess: () => {
      setSlackToken("");
      setSlackDefaultChannelId("");
      setSlackChannelId("");
      setSlackMessage("Hello from BuildAgent");
      setSlackLimit("20");
      setSlackCursor("");
      qc.invalidateQueries({ queryKey: ["slack-connector", meQ.data?.id ?? "anon"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
    },
  });

  const skill = skillQ.data;
  const isAdmin = meQ.data?.role === "admin";
  const isGmail = skill?.name === "gmail";
  const isCalendar = skill?.name === "calendar";
  const isWhatsApp = skill?.name === "whatsapp";
  const isTelegram = skill?.name === "telegram";
  const isSlack = skill?.name === "slack";
  const isSsh = skill?.name === "ssh";
  const sampleSkillBundle = useMemo(() => {
    const base = skill ?? {
      name: "sample",
      version: "0.1.0",
      description: "Sample skill",
      permissions: [] as string[],
      requires_approval: true,
      enabled: true,
      manifest: { source: "manual" } as Record<string, unknown>,
    };
    return {
      overwrite: true,
      presets: [
        {
          label: "baseline",
          version: base.version,
          description: base.description,
          permissions: base.permissions,
          requires_approval: base.requires_approval,
          enabled: base.enabled,
          manifest: { ...base.manifest, source: "manual" },
        },
        {
          label: "safe-readonly",
          version: base.version,
          description: "Read-only preset for inspection flows.",
          permissions: base.permissions,
          requires_approval: true,
          enabled: true,
          manifest: { ...(base.manifest ?? {}), source: "manual" },
        },
      ],
    };
  }, [skill]);

  useEffect(() => {
    if (!isSsh) return;
    const node = searchParams.get("node");
    if (node) setSshNodeId(node);
  }, [isSsh, searchParams]);

  const gmailPayload = useMemo(() => {
    if (!isGmail) return null;
    const payload: Record<string, unknown> = {
      op: gmailOp,
      ...gmailConfig,
    };
    if (gmailOp === "search") payload.query = gmailQuery;
    if (gmailOp === "list") payload.max_results = Number(gmailMaxResults) || 10;
    if (gmailOp === "read") payload.message_id = gmailMessageId;
    return payload;
  }, [gmailConfig, gmailMessageId, gmailMaxResults, gmailOp, gmailQuery, isGmail]);

  const calendarPayload = useMemo(() => {
    if (!isCalendar) return null;
    const payload: Record<string, unknown> = {
      op: calendarOp,
      calendar_id: calendarId || "primary",
      ...calendarConfig,
    };
    if (calendarOp === "list") {
      payload.max_results = Number(calendarMaxResults) || 10;
      if (calendarQuery.trim()) payload.query = calendarQuery.trim();
      if (calendarTimeMin.trim()) payload.time_min = calendarTimeMin.trim();
      if (calendarTimeMax.trim()) payload.time_max = calendarTimeMax.trim();
    }
    if (calendarOp === "get") payload.event_id = calendarEventId;
    return payload;
  }, [
    calendarConfig,
    calendarEventId,
    calendarId,
    calendarMaxResults,
    calendarOp,
    calendarQuery,
    calendarTimeMax,
    calendarTimeMin,
    isCalendar,
  ]);

  const whatsappPayload = useMemo(() => {
    if (!isWhatsApp) return null;
    return {
      op: "send_text",
      ...waConfig,
      recipient: waRecipient,
      message: waMessage,
    };
  }, [isWhatsApp, waConfig, waMessage, waRecipient]);

  const telegramPayload = useMemo(() => {
    if (!isTelegram) return null;
    const registered = Boolean(telegramQ.data?.registered);
    const payload: Record<string, unknown> = {
      op: telegramOp,
      default_chat_id: telegramDefaultChatId || telegramQ.data?.default_chat_id || "",
    };
    if (!registered && telegramToken.trim()) payload.bot_token = telegramToken.trim();
    if (telegramOp === "send_text") {
      payload.chat_id = telegramChatId.trim() || telegramQ.data?.default_chat_id || telegramDefaultChatId || "";
      payload.message = telegramMessage;
    }
    if (telegramOp === "get_updates") {
      if (telegramOffset.trim()) payload.offset = Number(telegramOffset);
      payload.limit = Number(telegramLimit) || 20;
    }
    return payload;
  }, [isTelegram, telegramDefaultChatId, telegramLimit, telegramMessage, telegramOffset, telegramOp, telegramQ.data?.default_chat_id, telegramQ.data?.registered, telegramToken, telegramChatId]);

  const slackPayload = useMemo(() => {
    if (!isSlack) return null;
    const registered = Boolean(slackQ.data?.registered);
    const payload: Record<string, unknown> = {
      op: slackOp,
      default_channel_id: slackDefaultChannelId || slackQ.data?.default_channel_id || "",
    };
    if (!registered && slackToken.trim()) payload.bot_token = slackToken.trim();
    if (slackOp === "send_text") {
      payload.channel_id = slackChannelId.trim() || slackQ.data?.default_channel_id || slackDefaultChannelId || "";
      payload.message = slackMessage;
    }
    if (slackOp === "history") {
      payload.channel_id = slackChannelId.trim() || slackQ.data?.default_channel_id || slackDefaultChannelId || "";
      payload.limit = Number(slackLimit) || 20;
      if (slackCursor.trim()) payload.cursor = slackCursor.trim();
    }
    return payload;
  }, [isSlack, slackChannelId, slackCursor, slackDefaultChannelId, slackLimit, slackMessage, slackOp, slackQ.data?.default_channel_id, slackQ.data?.registered, slackToken]);

  const sshPayload = useMemo(() => {
    if (!isSsh) return null;
    return {
      op: "exec",
      node_id: sshNodeId || null,
      command: sshCommand,
      timeout: Number(sshTimeout) || 60,
      pty: sshPty,
    };
  }, [isSsh, sshCommand, sshNodeId, sshPty, sshTimeout]);

  const runSkill = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = isGmail && gmailPayload ? gmailPayload
        : isCalendar && calendarPayload ? calendarPayload
        : isWhatsApp && whatsappPayload ? whatsappPayload
        : isTelegram && telegramPayload ? telegramPayload
        : isSlack && slackPayload ? slackPayload
        : isSsh && sshPayload ? sshPayload
        : parsePayload(payloadText);
      return api<Task>(`/v1/skills/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ payload }),
      });
    },
    onSuccess: (task) => {
      setRunTask(task);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
    },
  });

  useEffect(() => {
    if (typeof window === "undefined" || !isGmail) return;
    try {
      const raw = window.localStorage.getItem(GMAIL_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<GmailConfig>;
      setGmailConfig({
        refresh_token: String(saved.refresh_token ?? ""),
        client_id: String(saved.client_id ?? ""),
        client_secret: String(saved.client_secret ?? ""),
      });
    } catch {}
  }, [isGmail]);

  useEffect(() => {
    if (typeof window === "undefined" || !isCalendar) return;
    try {
      const raw = window.localStorage.getItem(CALENDAR_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<CalendarConfig>;
      setCalendarConfig({
        refresh_token: String(saved.refresh_token ?? ""),
        client_id: String(saved.client_id ?? ""),
        client_secret: String(saved.client_secret ?? ""),
      });
    } catch {}
  }, [isCalendar]);

  useEffect(() => {
    if (typeof window === "undefined" || !isWhatsApp) return;
    try {
      const raw = window.localStorage.getItem(WHATSAPP_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<WhatsAppConfig>;
      setWaConfig({
        access_token: String(saved.access_token ?? ""),
        phone_number_id: String(saved.phone_number_id ?? ""),
        version: String(saved.version ?? "v20.0"),
      });
    } catch {}
  }, [isWhatsApp]);

  useEffect(() => {
    if (!isTelegram) return;
    if (telegramQ.data?.default_chat_id) setTelegramDefaultChatId(telegramQ.data.default_chat_id);
  }, [isTelegram, telegramQ.data?.default_chat_id]);

  useEffect(() => {
    if (!isSlack) return;
    if (slackQ.data?.default_channel_id) setSlackDefaultChannelId(slackQ.data.default_channel_id);
  }, [isSlack, slackQ.data?.default_channel_id]);

  if (skillQ.isError) {
    return (
      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-white">Skill not found</CardTitle>
          <CardDescription>The id may be invalid or the skill was removed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/skills" className="text-sm text-slate-300 hover:text-white">
            Back to catalog
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted">Skill detail</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{skill?.name ?? "Loading..."}</h1>
          <p className="mt-2 text-sm text-muted">Single skill view with manifest, source, and admin controls.</p>
          {skill && (
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-border bg-panel px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Preset count</div>
                <div className="mt-1 text-lg font-semibold text-white">{String(presetsQ.data?.length ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-border bg-panel px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Preset mode</div>
                <div className="mt-1 text-lg font-semibold text-white">{skill.manifest?.source === "manual" ? "manual" : "file"}</div>
              </div>
              <div className="rounded-xl border border-border bg-panel px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Approval</div>
                <div className="mt-1 text-lg font-semibold text-white">{skill.requires_approval ? "gated" : "open"}</div>
              </div>
              <div className="rounded-xl border border-border bg-panel px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Selected</div>
                <div className="mt-1 text-lg font-semibold text-white">{skill.name}</div>
              </div>
            </div>
          )}
        </div>
        <Link href="/skills" className="rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-white">
          Back to catalog
        </Link>
      </div>

      {!skill && <Card className="border-white/10 bg-slate-950/70"><CardContent className="p-6 text-sm text-muted">Loading skill...</CardContent></Card>}

      {skill && (
      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">{skill.name}</CardTitle>
              <CardDescription>{skill.description || "No description."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={skill.enabled ? "default" : "secondary"}>{skill.enabled ? "enabled" : "disabled"}</Badge>
                <Badge variant={skill.requires_approval ? "outline" : "default"}>
                  {skill.requires_approval ? "approval" : "open"}
                </Badge>
                <Badge variant="secondary">{String(skill.manifest?.execution ?? "local")}</Badge>
                <Badge variant="secondary">{String(skill.manifest?.risk ?? "medium")}</Badge>
                <Badge variant="secondary">{String(skill.manifest?.source ?? "manual")}</Badge>
              </div>
              <div className="grid gap-3 text-sm">
                <Meta label="Version" value={skill.version} />
                <Meta label="Permissions" value={skill.permissions.length > 0 ? skill.permissions.join(", ") : "none"} />
                <Meta label="Schema keys" value={String(Object.keys((skill.manifest?.schema as Record<string, unknown>) ?? {}).length)} />
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={() => toggleSkill.mutate(!skill.enabled)} disabled={toggleSkill.isPending}>
                    {skill.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="ghost" onClick={() => deleteSkill.mutate()} disabled={deleteSkill.isPending}>
                    Delete
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Run skill</CardTitle>
                <CardDescription>
                  {isGmail
                    ? "Connect Gmail once, then list or read mail without hand-editing JSON."
                    : isCalendar
                      ? "Connect Calendar once, then list or inspect events without hand-editing JSON."
                      : isTelegram
                        ? "Register your own Telegram bot once, then send or inspect messages without sharing creds."
                      : isSlack
                        ? "Register your own Slack bot once, then send or inspect messages without sharing creds."
                      : isWhatsApp
                        ? "Connect WhatsApp once, then send text messages without hand-editing JSON."
                      : isSsh
                        ? "Pick a saved node, then run a remote command with the stored SSH host and auth."
                    : "Send JSON payload to the live skill handler. Approvals still apply if required."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isGmail ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Gmail op</label>
                        <select
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          value={gmailOp}
                          onChange={(e) => setGmailOp(e.target.value as typeof gmailOp)}
                        >
                          <option value="profile">profile</option>
                          <option value="list">list</option>
                          <option value="read">read</option>
                          <option value="search">search</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Max results</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          type="number"
                          min={1}
                          max={25}
                          value={gmailMaxResults}
                          onChange={(e) => setGmailMaxResults(e.target.value)}
                          disabled={gmailOp !== "list"}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Query</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="from:boss@example.com is:unread"
                          value={gmailQuery}
                          onChange={(e) => setGmailQuery(e.target.value)}
                          disabled={gmailOp !== "search"}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Message ID</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="18c123abc..."
                          value={gmailMessageId}
                          onChange={(e) => setGmailMessageId(e.target.value)}
                          disabled={gmailOp !== "read"}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">OAuth fields</div>
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Refresh token"
                        value={gmailConfig.refresh_token}
                        onChange={(e) => setGmailConfig((prev) => ({ ...prev, refresh_token: e.target.value }))}
                      />
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Client ID"
                        value={gmailConfig.client_id}
                        onChange={(e) => setGmailConfig((prev) => ({ ...prev, client_id: e.target.value }))}
                      />
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Client secret"
                        type="password"
                        value={gmailConfig.client_secret}
                        onChange={(e) => setGmailConfig((prev) => ({ ...prev, client_secret: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            window.localStorage.setItem(GMAIL_KEY, JSON.stringify(gmailConfig));
                          }}
                        >
                          Save Gmail creds
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setGmailConfig({ refresh_token: "", client_id: "", client_secret: "" });
                            window.localStorage.removeItem(GMAIL_KEY);
                          }}
                        >
                          Clear creds
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isCalendar ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Calendar op</label>
                        <select
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          value={calendarOp}
                          onChange={(e) => setCalendarOp(e.target.value as typeof calendarOp)}
                        >
                          <option value="list">list</option>
                          <option value="get">get</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Calendar ID</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="primary"
                          value={calendarId}
                          onChange={(e) => setCalendarId(e.target.value)}
                        />
                      </div>
                    </div>

                    {calendarOp === "list" && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Query</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="team sync"
                            value={calendarQuery}
                            onChange={(e) => setCalendarQuery(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Max results</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            type="number"
                            min={1}
                            max={25}
                            value={calendarMaxResults}
                            onChange={(e) => setCalendarMaxResults(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Time min</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="2026-05-23T00:00:00Z"
                            value={calendarTimeMin}
                            onChange={(e) => setCalendarTimeMin(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Time max</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="2026-05-24T00:00:00Z"
                            value={calendarTimeMax}
                            onChange={(e) => setCalendarTimeMax(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {calendarOp === "get" && (
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Event ID</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="event id"
                          value={calendarEventId}
                          onChange={(e) => setCalendarEventId(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">OAuth fields</div>
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Refresh token"
                        value={calendarConfig.refresh_token}
                        onChange={(e) => setCalendarConfig((prev) => ({ ...prev, refresh_token: e.target.value }))}
                      />
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Client ID"
                        value={calendarConfig.client_id}
                        onChange={(e) => setCalendarConfig((prev) => ({ ...prev, client_id: e.target.value }))}
                      />
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Client secret"
                        type="password"
                        value={calendarConfig.client_secret}
                        onChange={(e) => setCalendarConfig((prev) => ({ ...prev, client_secret: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            window.localStorage.setItem(CALENDAR_KEY, JSON.stringify(calendarConfig));
                          }}
                        >
                          Save Calendar creds
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setCalendarConfig({ refresh_token: "", client_id: "", client_secret: "" });
                            window.localStorage.removeItem(CALENDAR_KEY);
                          }}
                        >
                          Clear creds
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isWhatsApp ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Recipient</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="15551234567"
                          value={waRecipient}
                          onChange={(e) => setWaRecipient(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Graph version</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="v20.0"
                          value={waConfig.version}
                          onChange={(e) => setWaConfig((prev) => ({ ...prev, version: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.2em] text-muted">Message</label>
                      <textarea
                        className="min-h-28 w-full rounded-xl border border-border bg-bg p-3 text-sm text-slate-100 outline-none"
                        value={waMessage}
                        onChange={(e) => setWaMessage(e.target.value)}
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">WhatsApp Cloud API</div>
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Access token"
                        value={waConfig.access_token}
                        onChange={(e) => setWaConfig((prev) => ({ ...prev, access_token: e.target.value }))}
                      />
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Phone number ID"
                        value={waConfig.phone_number_id}
                        onChange={(e) => setWaConfig((prev) => ({ ...prev, phone_number_id: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            window.localStorage.setItem(WHATSAPP_KEY, JSON.stringify(waConfig));
                          }}
                        >
                          Save WhatsApp creds
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setWaConfig({ access_token: "", phone_number_id: "", version: "v20.0" });
                            setWaRecipient("");
                            setWaMessage("Hello from BuildAgent");
                            window.localStorage.removeItem(WHATSAPP_KEY);
                          }}
                        >
                          Clear creds
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isTelegram ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Telegram op</label>
                        <select
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          value={telegramOp}
                          onChange={(e) => setTelegramOp(e.target.value as typeof telegramOp)}
                        >
                          <option value="send_text">send_text</option>
                          <option value="me">me</option>
                          <option value="get_updates">get_updates</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Default chat ID</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="123456789"
                          value={telegramDefaultChatId}
                          onChange={(e) => setTelegramDefaultChatId(e.target.value)}
                        />
                      </div>
                    </div>

                    {telegramOp === "send_text" && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Chat ID</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="123456789"
                            value={telegramChatId}
                            onChange={(e) => setTelegramChatId(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Bot status</label>
                          <div className="rounded-xl border border-border bg-panel px-3 py-2 text-sm text-slate-200">
                            {telegramQ.isFetching
                              ? "Checking registration..."
                              : telegramQ.data?.registered
                                ? `Registered as @${telegramQ.data.bot_username ?? "bot"}`
                                : "Not registered yet"}
                          </div>
                        </div>
                      </div>
                    )}

                    {telegramOp !== "send_text" && (
                      <div className="rounded-xl border border-border bg-panel px-3 py-2 text-sm text-slate-200">
                        {telegramQ.isFetching
                          ? "Checking registration..."
                          : telegramQ.data?.registered
                            ? `Registered as @${telegramQ.data.bot_username ?? "bot"}`
                            : "Not registered yet"}
                      </div>
                    )}

                    {telegramOp === "send_text" && (
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Message</label>
                        <textarea
                          className="min-h-28 w-full rounded-xl border border-border bg-bg p-3 text-sm text-slate-100 outline-none"
                          value={telegramMessage}
                          onChange={(e) => setTelegramMessage(e.target.value)}
                        />
                      </div>
                    )}

                    {telegramOp === "get_updates" && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Offset</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="123"
                            value={telegramOffset}
                            onChange={(e) => setTelegramOffset(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Limit</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            type="number"
                            min={1}
                            max={100}
                            value={telegramLimit}
                            onChange={(e) => setTelegramLimit(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">Telegram bot registration</div>
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Bot token"
                        type="password"
                        value={telegramToken}
                        onChange={(e) => setTelegramToken(e.target.value)}
                      />
                      <p className="text-xs text-muted">
                        Saved per user in encrypted server storage. Other users get their own bot.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => saveTelegram.mutate()}
                          disabled={saveTelegram.isPending || !telegramToken.trim()}
                        >
                          Save Telegram bot
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => deleteTelegram.mutate()}
                          disabled={deleteTelegram.isPending || !telegramQ.data?.registered}
                        >
                          Clear bot
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isSlack ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Slack op</label>
                        <select
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          value={slackOp}
                          onChange={(e) => setSlackOp(e.target.value as typeof slackOp)}
                        >
                          <option value="send_text">send_text</option>
                          <option value="me">me</option>
                          <option value="history">history</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Default channel ID</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="C01234567"
                          value={slackDefaultChannelId}
                          onChange={(e) => setSlackDefaultChannelId(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-panel px-3 py-2 text-sm text-slate-200">
                      {slackQ.isFetching
                        ? "Checking registration..."
                        : slackQ.data?.registered
                          ? `Registered in ${slackQ.data.team ?? "Slack"} as ${slackQ.data.user ?? "user"}`
                          : "Not registered yet"}
                    </div>

                    {(slackOp === "send_text" || slackOp === "history") && (
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Channel ID</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="C01234567"
                          value={slackChannelId}
                          onChange={(e) => setSlackChannelId(e.target.value)}
                        />
                      </div>
                    )}

                    {slackOp === "send_text" && (
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Message</label>
                        <textarea
                          className="min-h-28 w-full rounded-xl border border-border bg-bg p-3 text-sm text-slate-100 outline-none"
                          value={slackMessage}
                          onChange={(e) => setSlackMessage(e.target.value)}
                        />
                      </div>
                    )}

                    {slackOp === "history" && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Limit</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            type="number"
                            min={1}
                            max={200}
                            value={slackLimit}
                            onChange={(e) => setSlackLimit(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.2em] text-muted">Cursor</label>
                          <input
                            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="next_cursor"
                            value={slackCursor}
                            onChange={(e) => setSlackCursor(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">Slack bot registration</div>
                      <input
                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                        placeholder="Bot token"
                        type="password"
                        value={slackToken}
                        onChange={(e) => setSlackToken(e.target.value)}
                      />
                      <p className="text-xs text-muted">
                        Saved per user in encrypted server storage. Other users get their own bot.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => saveSlack.mutate()}
                          disabled={saveSlack.isPending || !slackToken.trim()}
                        >
                          Save Slack bot
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => deleteSlack.mutate()}
                          disabled={deleteSlack.isPending || !slackQ.data?.registered}
                        >
                          Clear bot
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isSsh ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Node</label>
                        <select
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          value={sshNodeId}
                          onChange={(e) => setSshNodeId(e.target.value)}
                        >
                          <option value="">Select node</option>
                          {(nodesQ.data ?? []).map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.name}
                              {node.ssh_host ? ` (${node.ssh_user ? `${node.ssh_user}@` : ""}${node.ssh_host}:${node.ssh_port ?? 22})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Timeout seconds</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          type="number"
                          min={1}
                          max={600}
                          value={sshTimeout}
                          onChange={(e) => setSshTimeout(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-muted">Command</label>
                        <input
                          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="hostname"
                          value={sshCommand}
                          onChange={(e) => setSshCommand(e.target.value)}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                        <input
                          type="checkbox"
                          checked={sshPty}
                          onChange={(e) => setSshPty(e.target.checked)}
                        />
                        Allocate PTY
                      </label>
                    </div>

                    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">SSH target</div>
                      <div className="text-sm text-slate-200">
                        {sshNodeId
                          ? nodesQ.data?.find((node) => node.id === sshNodeId)
                            ? `${nodesQ.data.find((node) => node.id === sshNodeId)?.name}`
                            : "Selected node"
                          : "Pick a node from the fleet"}
                      </div>
                      <p className="text-xs text-muted">
                        Host, user, port, and SSH secret come from the node record. Password or key is stored server-side.
                      </p>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="min-h-40 w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs text-slate-200 outline-none"
                    value={payloadText}
                    onChange={(e) => setPayloadText(e.target.value)}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => runSkill.mutate()}
                    disabled={!["admin", "operator"].includes(meQ.data?.role ?? "") || runSkill.isPending}
                  >
                    {runSkill.isPending ? "Running..." : "Run skill"}
                  </Button>
                  <span className="text-xs text-muted">Need admin or operator role.</span>
                </div>
                {isGmail && (
                  <DataTable title="Gmail payload" data={gmailPayload} />
                )}
                {isCalendar && (
                  <DataTable title="Calendar payload" data={calendarPayload} />
                )}
                {isWhatsApp && (
                  <DataTable title="WhatsApp payload" data={whatsappPayload} />
                )}
                {isTelegram && (
                  <DataTable title="Telegram payload" data={telegramPayload} />
                )}
                {isSlack && (
                  <DataTable title="Slack payload" data={slackPayload} />
                )}
                {runSkill.isError && <p className="text-sm text-red-300">{String(runSkill.error)}</p>}
                {runTask && (
                  <div className="space-y-2 rounded-xl border border-border bg-panel p-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">task {runTask.state}</Badge>
                      <Badge variant="secondary">{runTask.id}</Badge>
                    </div>
                    {runTask.error && <p className="text-red-300">{runTask.error}</p>}
                    <DataTable title="Task result" data={runTask.result} accent />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Manifest</CardTitle>
                <CardDescription>Raw manifest JSON as stored in the catalog.</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable title="Manifest" data={skill.manifest} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-panel overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-white">Skill presets</div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.15em] text-muted">
                Preset label
                <input
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                  value={presetLabel}
                  onChange={(e) => setPresetLabel(e.target.value)}
                  placeholder="baseline"
                />
              </label>
            </div>
            <Button onClick={() => savePreset.mutate()} disabled={!isAdmin || !skill || !presetLabel.trim() || savePreset.isPending}>
              Save preset
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(presetsQ.data ?? []).map((preset) => (
              <div key={preset.id} className="rounded-xl border border-border bg-bg/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{preset.label}</div>
                  <Badge variant="outline">{preset.enabled ? "on" : "off"}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">
                  {preset.version} · {preset.permissions.length} perms
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => applyPreset.mutate(preset.label)} disabled={!isAdmin || applyPreset.isPending}>
                    Apply
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deletePreset.mutate(preset.label)} disabled={!isAdmin || deletePreset.isPending}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {(presetsQ.data?.length ?? 0) === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-bg/30 p-4 text-sm text-muted md:col-span-2">
                No skill presets saved yet.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-bg/30 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">Import / export</div>
                <div className="text-xs text-muted">Download the bundle or paste a JSON export to restore it.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setPresetImportText(JSON.stringify(sampleSkillBundle, null, 2))}
                  disabled={!isAdmin || !skill}
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
                        version: preset.version,
                        description: preset.description,
                        permissions: preset.permissions,
                        requires_approval: preset.requires_approval,
                        enabled: preset.enabled,
                        manifest: { source: "manual" },
                      })),
                    };
                    setPresetImportText(JSON.stringify(bundle, null, 2));
                  }}
                  disabled={!isAdmin || !skill || (presetsQ.data?.length ?? 0) === 0}
                >
                  Load current bundle
                </Button>
                <Button variant="outline" onClick={() => exportPresets.mutate()} disabled={!isAdmin || !skill || exportPresets.isPending}>
                  Export JSON
                </Button>
              </div>
            </div>
            <textarea
              className="min-h-32 w-full rounded-xl border border-border bg-bg p-3 text-xs font-mono text-slate-200 outline-none"
              placeholder='{"presets":[{"label":"baseline","version":"0.1.0","description":"...","permissions":[],"requires_approval":true,"enabled":true,"manifest":{}}]}'
              value={presetImportText}
              onChange={(e) => setPresetImportText(e.target.value)}
              disabled={!isAdmin || !skill}
            />
            <input
              type="file"
              accept="application/json,.json"
              className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-accent-hover"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPresetImportFile(file.name);
                const reader = new FileReader();
                reader.onload = () => setPresetImportText(String(reader.result ?? ""));
                reader.readAsText(file);
              }}
              disabled={!isAdmin || !skill}
            />
            {presetImportFile && <div className="text-[10px] font-mono text-muted">file: {presetImportFile}</div>}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={presetImportOverwrite}
                  onChange={(e) => setPresetImportOverwrite(e.target.checked)}
                  disabled={!isAdmin || !skill}
                />
                Overwrite existing
              </label>
              <Button
                variant="outline"
                onClick={() => importPresets.mutate()}
                disabled={!isAdmin || !skill || !presetImportText.trim() || importPresets.isPending}
              >
                Import presets
              </Button>
              {presetImportError && <span className="text-xs text-rose-400">{presetImportError}</span>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-panel px-4 py-3">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      <span className="max-w-[70%] truncate text-right text-slate-100">{value}</span>
    </div>
  );
}

function DataTable({ title, data, accent = false }: { title: string; data: unknown; accent?: boolean }) {
  const entries = toEntries(data);
  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted">{title}</div>
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-sm text-slate-400">No fields.</div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[180px,1fr] gap-3 px-3 py-2 text-xs">
              <div className="font-mono uppercase tracking-[0.2em] text-slate-500 break-all">{key}</div>
              <div className={`font-mono break-words ${accent ? "text-emerald-200" : "text-slate-200"}`}>{formatField(value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toEntries(data: unknown): Array<[string, unknown]> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>);
}

function formatField(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parsePayload(text: string): Record<string, unknown> {
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error("payload must be valid JSON");
  }
}
