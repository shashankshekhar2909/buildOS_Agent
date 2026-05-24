"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { HelpBanner } from "@/components/help-banner";
import { cn } from "@/lib/utils";

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
    refetchInterval: 30000,
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
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Automation</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">Task Builder</h1>
        <p className="mt-2 text-sm text-slate-400 font-sans">
          Schedule one-off or repeating tasks, test command invocations, and manage recurring automation routines.
        </p>
      </div>

      <HelpBanner
        title="Task flow"
        description="Use presets for common schedules, then edit payload, recurrence, and timing before creating the task."
        bullets={[
          "Task kind drives approvals and dispatch.",
          "Recurring tasks spawn from the scheduler.",
          "Skill payloads use { name, payload }.",
        ]}
        href="/skills"
        hrefLabel="Open skills catalog"
      />

      {/* Templates Selector Section */}
      <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold text-white font-sans">Preset Automation Templates</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            One-click presets to populate templates. Elements remain fully editable before creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                "rounded-2xl border p-4 text-left transition-all duration-300 relative group overflow-hidden",
                templateLabel === preset.label
                  ? "bg-accent/10 border-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                  : "border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.12] hover:-translate-y-0.5"
              )}
              onClick={() => applyPreset(preset)}
            >
              <div className="text-sm font-semibold text-white group-hover:text-accent transition-colors">{preset.label}</div>
              <div className="mt-2 text-xs leading-relaxed text-slate-400 font-sans">{preset.description}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* New Task Creator Console */}
      <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
        <CardHeader className="pb-4 border-b border-white/[0.06] bg-white/[0.01]">
          <CardTitle className="text-base font-bold text-white font-sans">Operational Builder Console</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Define target payload, triggers, and recurrence frequencies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Task Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. System Health Check"
              />
            </Field>
            <Field label="Automation Kind">
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k} className="bg-[#0b0c10]">
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Execution Schedule (Triggers)">
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="font-mono text-xs uppercase"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Recurrence Interval (minutes)">
              <Input
                type="number"
                min={1}
                value={repeatEveryMinutes}
                onChange={(e) => setRepeatEveryMinutes(e.target.value)}
                placeholder="e.g. 15 (optional)"
              />
            </Field>
            <Field label="Recurrence Bound (Until Date)">
              <Input
                type="datetime-local"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
                className="font-mono text-xs uppercase"
              />
            </Field>
            <Field label="Template Source Identification">
              <Input
                value={templateLabel}
                onChange={(e) => setTemplateLabel(e.target.value)}
                placeholder="manual"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <InfoPill label="Start" value={scheduledAt ? new Date(scheduledAt).toLocaleString() : "run now"} />
            <InfoPill label="Repeat" value={repeatEveryMinutes ? `every ${repeatEveryMinutes} min` : "one-off"} />
            <InfoPill label="End" value={repeatUntil ? new Date(repeatUntil).toLocaleString() : "no end"} />
          </div>

          {kind === "command" ? (
            <Field label="Execute Command Line Directive">
              <Input
                placeholder="e.g. uptime"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
          ) : (
            <Field label="Granted Operation Payload (JSON format)">
              <textarea
                className="min-h-32 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3.5 font-mono text-xs text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all"
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
              />
            </Field>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !title.trim() || Boolean(previewState.error)}>
              {create.isPending ? "Spawning Task..." : "Spawn Automation Task"}
            </Button>
            <span className="text-[10px] font-mono text-slate-500">Recurrence templates are saved as immutable payloads.</span>
          </div>

          {/* Dual-pane Live JSON Validator Preview */}
          <div className="space-y-1.5 pt-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Live Schema Validation Preview:</span>
            {previewState.error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400 font-mono">
                Payload format error: {previewState.error}
              </div>
            ) : (
              <pre className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#040508] p-4 text-[11px] font-mono text-slate-400 leading-relaxed max-h-40">
                {JSON.stringify(previewState.payload, null, 2)}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Automation Queue List */}
      <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
        <CardHeader className="pb-2 border-b border-white/[0.06] bg-white/[0.01]">
          <CardTitle className="text-base font-bold text-white font-sans">Active Automation Queue</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Pending queues, recurring triggers, execution hearts, and active cancellation hooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="p-4 text-left font-semibold">Task Title</th>
                  <th className="p-4 text-left font-semibold">Trigger Kind</th>
                  <th className="p-4 text-left font-semibold">Recurrence</th>
                  <th className="p-4 text-left font-semibold">Queue State</th>
                  <th className="p-4 text-left font-semibold">Scheduled Date</th>
                  <th className="p-4 text-left font-semibold">Created Date</th>
                  <th className="p-4 text-right font-semibold">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.01] transition-all duration-150">
                    <td className="p-4 font-semibold text-slate-200">{t.title}</td>
                    <td className="p-4"><span className="text-xs font-mono text-slate-400">{t.kind}</span></td>
                    <td className="p-4"><RecurrencePill payload={t.payload} /></td>
                    <td className="p-4"><StatePill v={t.state} /></td>
                    <td className="p-4 text-xs font-mono text-slate-400">{t.scheduled_at ? new Date(t.scheduled_at).toLocaleString() : "—"}</td>
                    <td className="p-4 text-xs font-mono text-slate-400">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      {!["completed", "failed", "cancelled"].includes(t.state) && (
                        <button className="text-xs font-semibold text-slate-500 hover:text-rose-400 transition-colors font-mono" onClick={() => cancel.mutate(t.id)}>
                          [Cancel]
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs font-mono text-slate-500">
                      No active automation tasks in queue. Use Builder Console to spawn one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

function RecurrencePill({ payload }: { payload: Record<string, unknown> }) {
  const repeat = payload["_repeat_every_minutes"];
  const until = payload["_repeat_until"];
  const template = payload["_template"];
  const parts = [
    typeof repeat === "number" || typeof repeat === "string" ? `every ${repeat}m` : null,
    typeof until === "string" && until ? `until ${new Date(until).toLocaleDateString()}` : null,
    typeof template === "string" && template ? template : null,
  ].filter(Boolean);
  if (parts.length === 0) {
    return <span className="text-xs font-mono text-slate-500">one-off</span>;
  }
  return <span className="text-xs font-mono text-slate-300">{parts.join(" · ")}</span>;
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-200">{value}</div>
    </div>
  );
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error("payload must be valid JSON");
  }
}
