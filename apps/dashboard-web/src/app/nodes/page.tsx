"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Node = { id: string; name: string; status: string; tags: string[]; last_seen: string | null };

export default function Nodes() {
  const { data = [] } = useQuery<Node[]>({
    queryKey: ["nodes"],
    queryFn: () => api<Node[]>("/v1/nodes"),
    refetchInterval: 4000,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nodes</h1>
      <table className="w-full text-sm border border-border rounded overflow-hidden">
        <thead className="bg-panel text-muted">
          <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Status</th><th className="text-left p-2">Tags</th><th className="text-left p-2">Last seen</th></tr>
        </thead>
        <tbody>
          {data.map((n) => (
            <tr key={n.id} className="border-t border-border">
              <td className="p-2">{n.name}</td>
              <td className="p-2"><Pill v={n.status} /></td>
              <td className="p-2 text-muted">{n.tags.join(", ")}</td>
              <td className="p-2 text-muted">{n.last_seen ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ v }: { v: string }) {
  const color = v === "online" ? "bg-emerald-700" : v === "degraded" ? "bg-yellow-700" : "bg-neutral-700";
  return <span className={`px-2 py-0.5 rounded text-xs ${color}`}>{v}</span>;
}
