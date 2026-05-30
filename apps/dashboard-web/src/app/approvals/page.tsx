"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { HelpBanner } from "@/components/help-banner";
import { cn } from "@/lib/utils";

type Approval = {
  id: string;
  task_id: string | null;
  agent_run_id: string | null;
  tool: string | null;
  tool_call_id: string | null;
  action: string;
  risk: string;
  payload: Record<string, unknown>;
  state: string;
  created_at: string;
};

export default function Approvals() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/v1/approvals"),
    refetchInterval: 30000,
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/v1/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
      toast.success(variables.approve ? "Approved" : "Denied");
    },
    onError: (e: unknown) => {
      toast.error("Decision failed", { description: e instanceof Error ? e.message.slice(0, 120) : undefined });
    },
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Gatekeeper</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">Security Approvals</h1>
        <p className="mt-2 text-sm text-slate-400 font-sans">
          Approve or deny privileged actions triggered by automation tasks or model directives.
        </p>
      </div>

      <HelpBanner
        title="Approval gate"
        description="Approve risky actions here. If a run or task is paused, the detail page will show the pending payload and the loop will resume after approval."
        bullets={[
          "High-risk tools pause here.",
          "Open the agent run detail for context.",
          "Deny keeps the action blocked.",
        ]}
        href="/agent-runs"
        hrefLabel="Open runs"
      />

      {/* Approvals List Queue */}
      <div className="space-y-4">
        {data.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-slate-950/20 p-8 text-center text-xs font-mono text-slate-500">
            No pending security approvals waiting in queue. System is fully clear.
          </div>
        )}

        {data.map((a) => {
          // Determine risk-sensitive accent border/shadow classes
          const riskStyles = {
            critical: "bg-rose-500 shadow-[0_0_10px_#f43f5e]",
            high: "bg-orange-500 shadow-[0_0_10px_#f97316]",
            medium: "bg-amber-500 shadow-[0_0_10px_#f59e0b]",
            low: "bg-slate-600",
          }[a.risk] || "bg-slate-600";

          return (
            <Card
              key={a.id}
              className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl relative overflow-hidden p-0 pl-1"
            >
              {/* Left-side risk color bar */}
              <div className={cn("absolute left-0 top-0 w-1 h-full", riskStyles)} />

              <div className="p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-200 tracking-tight">{a.action}</span>
                    <RiskPill v={a.risk} />

                    {a.agent_run_id && (
                      <Link
                        href={`/agent-runs/${a.agent_run_id}`}
                        className="inline-flex items-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-mono tracking-wide uppercase font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-all"
                      >
                        Agent Run &rarr;
                      </Link>
                    )}

                    {a.task_id && (
                      <span className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-mono tracking-wide uppercase font-semibold text-slate-400">
                        Task Queue
                      </span>
                    )}

                    {a.tool && (
                      <span className="text-[10px] font-mono text-slate-500 bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.04]">
                        tool: {a.tool}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Operational Payload:</span>
                    <pre className="text-xs font-mono text-slate-300 leading-relaxed rounded-xl border border-white/[0.06] bg-[#040508] p-3.5 max-h-48 overflow-y-auto max-w-3xl">
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Approve / Deny decision actions panel */}
                <div className="flex sm:flex-col gap-2 shrink-0 self-center md:self-start">
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:shadow-glow-emerald hover:brightness-110 active:scale-[0.98] transition-all w-28"
                    onClick={() => decide.mutate({ id: a.id, approve: true })}
                  >
                    Approve
                  </button>
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition-all w-28"
                    onClick={() => decide.mutate({ id: a.id, approve: false })}
                  >
                    Deny
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function RiskPill({ v }: { v: string }) {
  const color = ({ low: "bg-neutral-700", medium: "bg-yellow-700", high: "bg-orange-700", critical: "bg-red-700" } as Record<string, string>)[v] || "bg-neutral-700";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] ${color}`}>{v}</span>;
}
