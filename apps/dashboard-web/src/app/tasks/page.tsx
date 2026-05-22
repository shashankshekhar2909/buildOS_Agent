"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Task = {
  id: string;
  title: string;
  kind: string;
  state: string;
  node_id: string | null;
  payload: any;
  error: string | null;
  created_at: string;
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

  const create = useMutation({
    mutationFn: () =>
      api<Task>("/v1/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          kind,
          payload: kind === "command" ? { cmd: cmd.split(/\s+/).filter(Boolean) } : {},
        }),
      }),
    onSuccess: () => {
      setTitle(""); setCmd("");
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api<Task>(`/v1/tasks/${id}/cancel`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>

      <form
        className="flex flex-wrap gap-2 items-end p-3 rounded border border-border bg-panel"
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      >
        <Field label="Title">
          <input className="bg-bg border border-border rounded px-2 py-1 text-sm w-56" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Kind">
          <select className="bg-bg border border-border rounded px-2 py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
        {kind === "command" && (
          <Field label="Command">
            <input className="bg-bg border border-border rounded px-2 py-1 text-sm w-80 font-mono" placeholder="ls -la" value={cmd} onChange={(e) => setCmd(e.target.value)} />
          </Field>
        )}
        <button className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </button>
      </form>

      <table className="w-full text-sm border border-border rounded overflow-hidden">
        <thead className="bg-panel text-muted">
          <tr>
            <th className="text-left p-2">Title</th>
            <th className="text-left p-2">Kind</th>
            <th className="text-left p-2">State</th>
            <th className="text-left p-2">Created</th>
            <th className="text-left p-2"></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="p-2">{t.title}</td>
              <td className="p-2 text-muted">{t.kind}</td>
              <td className="p-2"><StatePill v={t.state} /></td>
              <td className="p-2 text-muted">{new Date(t.created_at).toLocaleString()}</td>
              <td className="p-2 text-right">
                {!["completed", "failed", "cancelled"].includes(t.state) && (
                  <button className="text-xs text-muted hover:text-red-400" onClick={() => cancel.mutate(t.id)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}{children}
    </label>
  );
}

function StatePill({ v }: { v: string }) {
  const color = ({
    completed: "bg-emerald-700",
    failed: "bg-red-700",
    cancelled: "bg-neutral-700",
    running: "bg-blue-700",
    queued: "bg-indigo-700",
    waiting_approval: "bg-yellow-700",
    pending: "bg-neutral-700",
  } as Record<string, string>)[v] || "bg-neutral-700";
  return <span className={`px-2 py-0.5 rounded text-xs ${color}`}>{v}</span>;
}
