import { cn } from "@/lib/utils";

const STATE_STYLES: Record<string, string> = {
  online: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  completed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  degraded: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  waiting_approval: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  queued: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  running: "border-sky-500/20 bg-sky-500/10 text-sky-400 animate-pulse",
  failed: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  denied: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  cancelled: "border-white/10 bg-white/5 text-slate-400",
  offline: "border-white/10 bg-white/5 text-slate-400",
};

const RISK_STYLES: Record<string, string> = {
  low: "border-white/10 bg-white/5 text-slate-400",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  high: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  critical: "border-rose-500/20 bg-rose-500/10 text-rose-400 font-bold animate-pulse",
};

export function StatePill({ v, className }: { v: string; className?: string }) {
  const styles = STATE_STYLES[v] || "border-white/10 bg-white/5 text-slate-400";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        styles,
        className
      )}
    >
      {v}
    </span>
  );
}

export function RiskPill({ v, className }: { v: string; className?: string }) {
  const styles = RISK_STYLES[v] || "border-white/10 bg-white/5 text-slate-400";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        styles,
        className
      )}
    >
      {v}
    </span>
  );
}
