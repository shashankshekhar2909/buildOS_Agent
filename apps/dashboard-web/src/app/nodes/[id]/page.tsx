"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  last_metrics: Record<string, unknown>;
  last_seen: string | null;
  created_at: string;
};

export default function NodeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const nodeQ = useQuery<Node>({
    queryKey: ["node", id],
    queryFn: () => api<Node>(`/v1/nodes/${id}`),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/v1/nodes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      router.push("/nodes");
    },
  });

  const node = nodeQ.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Infrastructure</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">
            {node?.name ?? "Node"}
          </h1>
          <p className="mt-2 text-sm text-slate-400 font-sans">
            SSH host, live heartbeat, and telemetry for this node.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nodes" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white">
            Back to fleet
          </Link>
          <Link
            href={`/skills/ssh?node=${id}`}
            className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-white"
          >
            Open SSH runner
          </Link>
        </div>
      </div>

      {!node && <Card className="border-white/10 bg-slate-950/70"><CardContent className="p-6 text-sm text-muted">Loading node...</CardContent></Card>}

      {node && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Node state</CardTitle>
              <CardDescription>Current registration and connectivity state.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={node.status === "online" ? "default" : "secondary"}>{node.status}</Badge>
                <Badge variant={node.ssh_configured ? "default" : "outline"}>
                  {node.ssh_configured ? "ssh ready" : "ssh not set"}
                </Badge>
              </div>
              <div className="grid gap-3 text-sm">
                <Row label="Last seen" value={node.last_seen ? new Date(node.last_seen).toLocaleString() : "no contact"} />
                <Row label="SSH target" value={node.ssh_host ? `${node.ssh_user ? `${node.ssh_user}@` : ""}${node.ssh_host}:${node.ssh_port ?? 22}` : "not configured"} />
                <Row label="SSH auth" value={node.ssh_auth_type ?? "none"} />
                <Row label="Tags" value={node.tags.length > 0 ? node.tags.join(", ") : "none"} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">SSH setup</CardTitle>
              <CardDescription>
                Store host, user, and either password or private key on the node, then run commands from the SSH skill.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Connection hint</div>
                <pre className="mt-2 overflow-x-auto text-xs text-slate-300">
{node.ssh_host ? `${node.ssh_user ? `${node.ssh_user}@` : ""}${node.ssh_host}:${node.ssh_port ?? 22}` : "Set SSH host/user in the fleet editor"}
                </pre>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Telemetry</div>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-slate-300">
{JSON.stringify(node.last_metrics ?? {}, null, 2)}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["node", id] })}>
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  className="hover:bg-rose-500/10 hover:text-rose-300"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                >
                  Delete node
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="text-slate-100">{value}</div>
    </div>
  );
}
