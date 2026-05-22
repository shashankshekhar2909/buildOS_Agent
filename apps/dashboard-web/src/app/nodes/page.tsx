"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Node = {
  id: string;
  name: string;
  status: string;
  tags: string[];
  capabilities: Record<string, unknown>;
  last_seen: string | null;
  created_at: string;
};

type NodeRegisterOut = {
  node: Node;
  register_token: string;
};

export default function Nodes() {
  const qc = useQueryClient();
  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });
  const { data = [] } = useQuery<Node[]>({
    queryKey: ["nodes"],
    queryFn: () => api<Node[]>("/v1/nodes"),
    refetchInterval: 4000,
  });

  const isAdmin = meQ.data?.role === "admin";
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newStatus, setNewStatus] = useState("offline");
  const [newCapabilities, setNewCapabilities] = useState("{\n  \"gpu\": false\n}");
  const [createdToken, setCreatedToken] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editStatus, setEditStatus] = useState("offline");
  const [editCapabilities, setEditCapabilities] = useState("{\n}\n");

  const create = useMutation({
    mutationFn: () =>
      api<NodeRegisterOut>("/v1/nodes", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          tags: splitList(newTags),
          status: newStatus,
          capabilities: parseJson(newCapabilities),
        }),
      }),
    onSuccess: (out) => {
      setCreatedToken(out.register_token);
      setNewName("");
      setNewTags("");
      qc.invalidateQueries({ queryKey: ["nodes"] });
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api<Node>(`/v1/nodes/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName || null,
          tags: splitList(editTags),
          status: editStatus,
          capabilities: parseJson(editCapabilities),
        }),
      }),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["nodes"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/v1/nodes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });

  const editingNode = useMemo(() => data.find((node) => node.id === editingId) ?? null, [data, editingId]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Nodes</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Node fleet</h1>
        <p className="mt-2 text-sm text-muted">Create, edit, and remove nodes from the fleet.</p>
      </div>

      {isAdmin && (
        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Create node</CardTitle>
            <CardDescription>New node gets a one-time register token.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name">
                <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
              <Field label="Tags">
                <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" placeholder="gpu, eu-west" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Status">
                <select className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                  <option value="offline">offline</option>
                  <option value="online">online</option>
                  <option value="degraded">degraded</option>
                </select>
              </Field>
              <Field label="Capabilities JSON">
                <textarea className="min-h-24 w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs text-slate-100 outline-none" value={newCapabilities} onChange={(e) => setNewCapabilities(e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !newName.trim()}>
                {create.isPending ? "Creating..." : "Create node"}
              </Button>
              {createdToken && <Badge variant="secondary">token: {createdToken}</Badge>}
            </div>
            {createdToken && <p className="text-xs text-muted">Copy the token once. It is not stored again.</p>}
          </CardContent>
        </Card>
      )}

      {isAdmin && editingNode && (
        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Edit node</CardTitle>
            <CardDescription>{editingNode.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name">
                <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </Field>
              <Field label="Tags">
                <input className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Status">
                <select className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="offline">offline</option>
                  <option value="online">online</option>
                  <option value="degraded">degraded</option>
                </select>
              </Field>
              <Field label="Capabilities JSON">
                <textarea className="min-h-24 w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs text-slate-100 outline-none" value={editCapabilities} onChange={(e) => setEditCapabilities(e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => update.mutate()} disabled={update.isPending || !editingId}>
                {update.isPending ? "Saving..." : "Save node"}
              </Button>
              <Button variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-white">Fleet</CardTitle>
          <CardDescription>Live nodes, status, tags, and actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-panel text-muted">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Tags</th>
                  <th className="p-3 text-left">Last seen</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((node) => (
                  <tr key={node.id} className="border-t border-border">
                    <td className="p-3 text-white">{node.name}</td>
                    <td className="p-3"><Pill v={node.status} /></td>
                    <td className="p-3 text-muted">{node.tags.join(", ") || "none"}</td>
                    <td className="p-3 text-muted">{node.last_seen ? new Date(node.last_seen).toLocaleString() : "—"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        {isAdmin && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(node.id);
                                setEditName(node.name);
                                setEditTags(node.tags.join(", "));
                                setEditStatus(node.status);
                                setEditCapabilities(JSON.stringify(node.capabilities ?? {}, null, 2));
                              }}
                            >
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remove.mutate(node.id)} disabled={remove.isPending}>
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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

function Pill({ v }: { v: string }) {
  const color = v === "online" ? "bg-emerald-700" : v === "degraded" ? "bg-yellow-700" : "bg-neutral-700";
  return <span className={`rounded px-2 py-0.5 text-xs text-white ${color}`}>{v}</span>;
}

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error("capabilities must be valid JSON");
  }
}
