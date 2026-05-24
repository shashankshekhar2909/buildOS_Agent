"use client";

import Link from "next/link";
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

type Me = { id: string; email: string; role: string; is_active: boolean };
type Node = {
  id: string;
  name: string;
  status: string;
  tags: string[];
  capabilities: Record<string, unknown>;
  ssh_host: string | null;
  ssh_user: string | null;
  ssh_port: number | null;
  ssh_auth_type: string | null;
  ssh_configured: boolean;
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
  const [newSshHost, setNewSshHost] = useState("");
  const [newSshUser, setNewSshUser] = useState("");
  const [newSshPort, setNewSshPort] = useState("22");
  const [newSshAuthType, setNewSshAuthType] = useState("password");
  const [newSshSecret, setNewSshSecret] = useState("");
  const [newSshKnownHosts, setNewSshKnownHosts] = useState("");
  const [createdToken, setCreatedToken] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editStatus, setEditStatus] = useState("offline");
  const [editCapabilities, setEditCapabilities] = useState("{\n}\n");
  const [editSshHost, setEditSshHost] = useState("");
  const [editSshUser, setEditSshUser] = useState("");
  const [editSshPort, setEditSshPort] = useState("22");
  const [editSshAuthType, setEditSshAuthType] = useState("password");
  const [editSshSecret, setEditSshSecret] = useState("");
  const [editSshKnownHosts, setEditSshKnownHosts] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<NodeRegisterOut>("/v1/nodes", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          tags: splitList(newTags),
          status: newStatus,
          capabilities: parseJson(newCapabilities),
          ssh_host: newSshHost.trim() || null,
          ssh_user: newSshUser.trim() || null,
          ssh_port: parsePort(newSshPort),
          ssh_auth_type: newSshAuthType,
          ...sshSecretPayload(newSshAuthType, newSshSecret, newSshKnownHosts),
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
          ssh_host: editSshHost.trim() || null,
          ssh_user: editSshUser.trim() || null,
          ssh_port: parsePort(editSshPort),
          ssh_auth_type: editSshAuthType,
          ...sshSecretPayload(editSshAuthType, editSshSecret, editSshKnownHosts),
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
    <div className="space-y-8 animate-fade-in">
      {/* Node Page Header */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Infrastructure</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">Node Fleet Control</h1>
        <p className="mt-2 text-sm text-slate-400 font-sans">
          Manage your distributed processing nodes, issue register tokens, and monitor host system metrics.
        </p>
      </div>

      <HelpBanner
        title="Node setup"
        description="Add host, user, and SSH auth here. The SSH skill reads these saved fields when you run commands against a node."
        bullets={[
          "Create nodes from the admin form.",
          "Use password or private key auth.",
          "Open a node detail page for SSH target and telemetry.",
        ]}
        href="/skills/ssh"
        hrefLabel="Open SSH skill"
      />

      {isAdmin && (
      <div className="grid gap-6 md:grid-cols-2">
          {/* Create Node Glass Card */}
          <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-white font-sans">Register New Node</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Generate a one-time cryptographic token to link a remote node agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Node Name">
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. laptop-1" />
                </Field>
                <Field label="Node Tags (comma separated)">
                  <Input placeholder="e.g. dev, linux, gpu" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Initial State">
                  <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                    <option value="offline" className="bg-[#0b0c10]">Offline</option>
                    <option value="online" className="bg-[#0b0c10]">Online</option>
                    <option value="degraded" className="bg-[#0b0c10]">Degraded</option>
                  </Select>
                </Field>
                <Field label="Capabilities (JSON format)">
                  <textarea className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all" value={newCapabilities} onChange={(e) => setNewCapabilities(e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SSH Host / IP">
                  <Input value={newSshHost} onChange={(e) => setNewSshHost(e.target.value)} placeholder="10.0.0.12" />
                </Field>
                <Field label="SSH User">
                  <Input value={newSshUser} onChange={(e) => setNewSshUser(e.target.value)} placeholder="ubuntu" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SSH Port">
                  <Input value={newSshPort} onChange={(e) => setNewSshPort(e.target.value)} placeholder="22" />
                </Field>
                <Field label="SSH Auth Type">
                  <Select value={newSshAuthType} onChange={(e) => setNewSshAuthType(e.target.value)}>
                    <option value="password" className="bg-[#0b0c10]">Password</option>
                    <option value="key" className="bg-[#0b0c10]">Private Key</option>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={newSshAuthType === "password" ? "SSH Password" : "SSH Private Key"}>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all"
                    value={newSshSecret}
                    onChange={(e) => setNewSshSecret(e.target.value)}
                    placeholder={newSshAuthType === "password" ? "Password" : "-----BEGIN OPENSSH PRIVATE KEY-----"}
                  />
                </Field>
                <Field label="SSH Known Hosts">
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all"
                    value={newSshKnownHosts}
                    onChange={(e) => setNewSshKnownHosts(e.target.value)}
                    placeholder="Optional known_hosts line or file content"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => create.mutate()} disabled={create.isPending || !newName.trim()}>
                  {create.isPending ? "Generating..." : "Create Node"}
                </Button>
                {createdToken && (
                  <Badge variant="outline" className="font-mono text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/5 py-1 px-2.5">
                    Token: {createdToken}
                  </Badge>
                )}
              </div>
              {createdToken && <p className="text-[10px] font-mono text-slate-500">Copy token now. It will not be shown again for security.</p>}
            </CardContent>
          </Card>

          {/* Edit Node Glass Card */}
          {editingNode ? (
            <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 h-16 w-16 bg-accent/5 rounded-full blur-xl" />
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-bold text-white font-sans">Modify Node Profile</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Editing record: <span className="font-mono text-slate-200">{editingNode.name}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Node Name">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </Field>
                  <Field label="Node Tags">
                    <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status Override">
                    <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="offline" className="bg-[#0b0c10]">Offline</option>
                      <option value="online" className="bg-[#0b0c10]">Online</option>
                      <option value="degraded" className="bg-[#0b0c10]">Degraded</option>
                    </Select>
                  </Field>
                  <Field label="Capabilities Profile">
                    <textarea className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3 font-mono text-xs text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all" value={editCapabilities} onChange={(e) => setEditCapabilities(e.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="SSH Host / IP">
                    <Input value={editSshHost} onChange={(e) => setEditSshHost(e.target.value)} placeholder="10.0.0.12" />
                  </Field>
                  <Field label="SSH User">
                    <Input value={editSshUser} onChange={(e) => setEditSshUser(e.target.value)} placeholder="ubuntu" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="SSH Port">
                    <Input value={editSshPort} onChange={(e) => setEditSshPort(e.target.value)} placeholder="22" />
                  </Field>
                  <Field label="SSH Auth Type">
                    <Select value={editSshAuthType} onChange={(e) => setEditSshAuthType(e.target.value)}>
                      <option value="password" className="bg-[#0b0c10]">Password</option>
                      <option value="key" className="bg-[#0b0c10]">Private Key</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={editSshAuthType === "password" ? "SSH Password" : "SSH Private Key"}>
                    <textarea
                      className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3 font-mono text-xs text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all"
                      value={editSshSecret}
                      onChange={(e) => setEditSshSecret(e.target.value)}
                    />
                  </Field>
                  <Field label="SSH Known Hosts">
                    <textarea
                      className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-[#0c0d12]/50 p-3 font-mono text-xs text-slate-200 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 focus:shadow-glow-accent transition-all"
                      value={editSshKnownHosts}
                      onChange={(e) => setEditSshKnownHosts(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => update.mutate()} disabled={update.isPending || !editingId}>
                    {update.isPending ? "Saving..." : "Save changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="hidden md:flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] bg-slate-950/10 p-6 text-center text-slate-500">
              <p className="text-xs font-mono">Select a node from the fleet list below to edit its system values.</p>
            </div>
          )}
        </div>
      )}

      {/* Fleet Virtual Rack Container */}
      <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-white font-sans">Active Server Fleet</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Current server telemetry logs, diagnostic statuses, and node actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="p-4 text-left font-semibold">Node Name</th>
                  <th className="p-4 text-left font-semibold">Diagnostic State</th>
                  <th className="p-4 text-left font-semibold">System Tags</th>
                  <th className="p-4 text-left font-semibold">SSH</th>
                  <th className="p-4 text-left font-semibold">Last Contact</th>
                  <th className="p-4 text-right font-semibold">Control Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.map((node) => (
                  <tr key={node.id} className="hover:bg-white/[0.01] transition-all duration-150">
                    <td className="p-4 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${
                          node.status === "online"
                            ? "bg-emerald-400 status-glow-emerald"
                            : node.status === "degraded"
                              ? "bg-amber-400 status-glow-amber"
                            : "bg-rose-400 status-glow-rose"
                        }`} />
                        <Link href={`/nodes/${node.id}`} className="hover:text-white hover:underline">
                          {node.name}
                        </Link>
                      </div>
                    </td>
                    <td className="p-4"><Pill v={node.status} /></td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {node.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] font-mono tracking-wide">{tag}</Badge>
                        ))}
                        {node.tags.length === 0 && <span className="text-xs text-slate-500 font-mono">none</span>}
                      </div>
                    </td>
                    <td className="p-4 text-xs font-mono text-slate-400">
                      {node.ssh_host ? (
                        <div className="space-y-1">
                          <div>
                            {node.ssh_user ? `${node.ssh_user}@${node.ssh_host}` : node.ssh_host}:{node.ssh_port ?? 22}
                          </div>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {node.ssh_auth_type ?? "password"} {node.ssh_configured ? "ready" : "partial"}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-slate-500">not set</span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-mono text-slate-400">
                      {node.last_seen ? new Date(node.last_seen).toLocaleString() : "no contact"}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1.5">
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
                                setEditSshHost(node.ssh_host ?? "");
                                setEditSshUser(node.ssh_user ?? "");
                                setEditSshPort(String(node.ssh_port ?? 22));
                                setEditSshAuthType(node.ssh_auth_type ?? "password");
                                setEditSshSecret("");
                                setEditSshKnownHosts("");
                              }}
                            >
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="hover:bg-rose-500/10 hover:text-rose-400" onClick={() => remove.mutate(node.id)} disabled={remove.isPending}>
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs font-mono text-slate-500">
                      No nodes currently registered in database. Use Register New Node form to start.
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

function parsePort(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const port = Number.parseInt(trimmed, 10);
  return Number.isFinite(port) ? port : null;
}

function sshSecretPayload(authType: string, secret: string, knownHosts: string): Record<string, string | null> {
  const trimmedSecret = secret.trim();
  const trimmedKnownHosts = knownHosts.trim();
  const payload: Record<string, string | null> = {};
  if (authType === "password" && trimmedSecret) payload.ssh_password = trimmedSecret;
  if (authType === "key" && trimmedSecret) payload.ssh_private_key = trimmedSecret;
  if (trimmedKnownHosts) payload.ssh_known_hosts = trimmedKnownHosts;
  return payload;
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
