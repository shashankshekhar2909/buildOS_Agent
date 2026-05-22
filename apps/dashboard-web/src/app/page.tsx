"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Node = { id: string; name: string; status: string; last_metrics: any };

export default function Overview() {
  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ["nodes"],
    queryFn: () => api<Node[]>("/v1/nodes"),
    refetchInterval: 5000,
  });

  const online = nodes.filter((n) => n.status === "online").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-3 gap-4">
        <Card label="Nodes online" value={`${online}/${nodes.length}`} />
        <Card label="Tasks" value="—" />
        <Card label="Approvals" value="—" />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
