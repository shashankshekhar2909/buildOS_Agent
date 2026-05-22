"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Approval = {
  id: string;
  task_id: string | null;
  action: string;
  risk: string;
  payload: any;
  state: string;
  created_at: string;
};

export default function Approvals() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/v1/approvals"),
    refetchInterval: 3000,
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/v1/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <p className="text-xs text-muted">Dangerous actions wait here. Approve = task moves to queued. Deny = task cancelled.</p>
      <div className="space-y-2">
        {data.length === 0 && <div className="text-muted text-sm">No pending approvals.</div>}
        {data.map((a) => (
          <div key={a.id} className="rounded border border-border bg-panel p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{a.action} <RiskPill v={a.risk} /></div>
              <pre className="text-xs text-muted mt-1 max-w-xl overflow-x-auto">{JSON.stringify(a.payload, null, 2)}</pre>
            </div>
            <div className="flex gap-2">
              <button
                className="bg-emerald-700 text-white rounded px-3 py-1.5 text-sm"
                onClick={() => decide.mutate({ id: a.id, approve: true })}
              >
                Approve
              </button>
              <button
                className="bg-red-700 text-white rounded px-3 py-1.5 text-sm"
                onClick={() => decide.mutate({ id: a.id, approve: false })}
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskPill({ v }: { v: string }) {
  const color = ({ low: "bg-neutral-700", medium: "bg-yellow-700", high: "bg-orange-700", critical: "bg-red-700" } as Record<string, string>)[v] || "bg-neutral-700";
  return <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${color}`}>{v}</span>;
}
