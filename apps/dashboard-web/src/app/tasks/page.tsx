"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Task = {
  id: string;
  title: string;
  kind: string;
  state: string;
  node_id: string | null;
  payload: Record<string, unknown>;
  scheduled_at: string | null;
  error: string | null;
  created_at: string;
};

type TemplatePreset = {
  id: string;
  label: string;
  description: string;
  apply: () => void;
};

const KINDS = ["command", "skill", "agent", "workflow", "deploy", "restart", "delete", "send_email"];

export default function Tasks() {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api<Task[]>("/v1/tasks"),
    refetchInterval: 3000,
  });

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("command");
  const [cmd, setCmd] = useState("");
  const [payloadText, setPayloadText] = useState("{\n}\n");
  const [scheduledAt, setScheduledAt] = useState("");
  const [repeatEveryMinutes, setRepeatEveryMinutes] = useState("");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [templateLabel, setTemplateLabel] = useState("");

  const applyPreset = (preset: TemplatePreset) => {
    preset.apply();
    setTemplateLabel(preset.label);
  };

  const presets: TemplatePreset[] = [
    {
      id: "node-health",
      label: "Node health check",
      description: "Simple command run on a schedule.",
      apply: () => {
        setTitle("Node health check");
        setKind("command");
        setCmd("uptime");
        setPayloadText("{\n}\n");
        setScheduledAt("");
        setRepeatEveryMinutes("15");
        setRepeatUntil("");
      },
    },
    {
      id: "gmail-digest",
      label: "Gmail unread digest",
      description: "Scheduled Gmail search with repeat.",
      apply: () => {
        setTitle("Gmail unread digest");
        setKind("skill");
        setCmd("");
        setPayloadText(JSON.stringify({ name: "gmail", payload: { op: "search", query: "is:unread", max_results: 10 } }, null, 2));
        setScheduledAt("");
        setRepeatEveryMinutes("30");
        setRepeatUntil("");
      },
    },
    {
      id: "calendar-scan",
      label: "Calendar scan",
      description: "Recurring calendar list task.",
      apply: () => {
        setTitle("Calendar scan");
        setKind("skill");
        setCmd("");
        setPayloadText(JSON.stringify({ name: "calendar", payload: { op: "list", calendar_id: "primary", max_results: 10 } }, null, 2));
        setScheduledAt("");
        setRepeatEveryMinutes("60");
        setRepeatUntil("");
      },
    },
    {
      id: "telegram-check",
      label: "Telegram updates",
      description: "Repeating Telegram bot poll.",
      apply: () => {
        setTitle("Telegram updates");
        setKind("skill");
        setCmd("");
        setPayloadText(JSON.stringify({ name: "telegram", payload: { op: "get_updates", limit: 20 } }, null, 2));
        setScheduledAt("");
        setRepeatEveryMinutes("5");
        setRepeatUntil("");
      },
    },
    {
      id: "slack-check",
      label: "Slack history",
      description: "Repeating Slack history fetch.",
      apply: () => {
        setTitle("Slack history");
        setKind("skill");
        setCmd("");
        setPayloadText(JSON.stringify({ name: "slack", payload: { op: "history", limit: 20 } }, null, 2));
        setScheduledAt("");
        setRepeatEveryMinutes("5");
        setRepeatUntil("");
      },
    },
  ];

  const create = useMutation({
    mutationFn: () =>
      api<Task>("/v1/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          kind,
          payload: previewState.payload ?? {},
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          repeat_every_minutes: repeatEveryMinutes ? Number(repeatEveryMinutes) : null,
          repeat_until: repeatUntil ? new Date(repeatUntil).toISOString() : null,
          template: templateLabel || null,
        }),
      }),
    onSuccess: () => {
      setTitle("");
      setCmd("");
      setPayloadText("{\n}\n");
      setScheduledAt("");
      setRepeatEveryMinutes("");
      setRepeatUntil("");
      setTemplateLabel("");
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api<Task>(`/v1/tasks/${id}/cancel`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const previewState = useMemo(() => {
    try {
      return { payload: buildPayload(kind, cmd, payloadText), error: null as string | null };
    } catch (err) {
      return { payload: null as Record<string, unknown> | null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [kind, cmd, payloadText]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Tasks</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Task builder</h1>
        <p className="mt-2 text-sm text-muted">Use templates for checks, schedules, and recurring jobs.</p>
      </div>

      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-white">Templates</CardTitle>
          <CardDescription>One click presets. They still stay editable before create.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="rounded-2xl border border-border bg-bg p-4 text-left transition hover:border-white/30 hover:bg-white/5"
              onClick={() => applyPreset(preset)}
            >
              <div className="text-sm font-semibold text-white">{preset.label}</div>
              <div className="mt-2 text-xs leading-5 text-muted">{preset.description}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-white">New task</CardTitle>
          <CardDescription>Create a one-off or recurring task.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Title">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Daily Gmail digest"
              />
            </Field>
            <Field label="Kind">
              <select
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Schedule at">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Repeat every minutes">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                type="number"
                min={1}
                value={repeatEveryMinutes}
                onChange={(e) => setRepeatEveryMinutes(e.target.value)}
                placeholder="15"
              />
            </Field>
            <Field label="Repeat until">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                type="datetime-local"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
            </Field>
            <Field label="Template">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                value={templateLabel}
                onChange={(e) => setTemplateLabel(e.target.value)}
                placeholder="manual"
              />
            </Field>
          </div>

          {kind === "command" ? (
            <Field label="Command">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-mono text-sm text-slate-100 outline-none"
                placeholder="uptime"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Payload JSON">
              <textarea
                className="min-h-40 w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs text-slate-100 outline-none"
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
              />
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !title.trim() || Boolean(previewState.error)}>
              {create.isPending ? "Creating..." : "Create task"}
            </Button>
            <span className="text-xs text-muted">Recurring jobs keep the same payload metadata.</span>
          </div>

          {previewState.error ? (
            <p className="text-sm text-red-300">{previewState.error}</p>
          ) : (
            <pre className="overflow-x-auto rounded-xl border border-border bg-bg p-3 text-[11px] text-slate-300">
              {JSON.stringify(previewState.payload, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-white">Open tasks</CardTitle>
          <CardDescription>Live queue, runs, failures, and completed jobs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 overflow-hidden rounded-xl border border-border p-0">
          <TableHead columns={["Title", "Kind", "State", "Scheduled", "Created", ""]} />
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <div key={t.id} className="grid gap-3 px-4 py-3 text-sm text-white" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                <div className="min-w-0 truncate">{t.title}</div>
                <div className="min-w-0 truncate text-muted">{t.kind}</div>
                <div className="min-w-0"><StatePill v={t.state} /></div>
                <div className="min-w-0 truncate text-muted">{t.scheduled_at ? new Date(t.scheduled_at).toLocaleString() : "—"}</div>
                <div className="min-w-0 truncate text-muted">{new Date(t.created_at).toLocaleString()}</div>
                <div className="text-right">
                  {!["completed", "failed", "cancelled"].includes(t.state) && (
                    <button className="text-xs text-muted hover:text-red-400" onClick={() => cancel.mutate(t.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && <EmptyRow message="No tasks yet." cols={6} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function buildPayload(kind: string, cmd: string, payloadText: string): Record<string, unknown> {
  if (kind === "command") {
    return {
      cmd: cmd.split(/\s+/).filter(Boolean),
    };
  }
  return parseJson(payloadText);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function TableHead({ columns }: { columns: string[] }) {
  return (
    <div
      className="grid gap-3 border-b border-border bg-bg/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted"
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((column) => (
        <div key={column}>{column}</div>
      ))}
    </div>
  );
}

function EmptyRow({ message, cols }: { message: string; cols: number }) {
  return (
    <div className="px-4 py-6 text-sm text-muted" style={{ gridColumn: `span ${cols}` }}>
      {message}
    </div>
  );
}

function StatePill({ v }: { v: string }) {
  const color =
    (
      {
        completed: "bg-emerald-700",
        failed: "bg-red-700",
        cancelled: "bg-neutral-700",
        running: "bg-blue-700",
        queued: "bg-indigo-700",
        waiting_approval: "bg-yellow-700",
        pending: "bg-neutral-700",
      } as Record<string, string>
    )[v] || "bg-neutral-700";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs ${color}`}>{v}</span>;
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error("payload must be valid JSON");
  }
}
